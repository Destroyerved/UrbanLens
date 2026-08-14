import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import json
import time
import random
import requests

OUT = "raw/osm"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

BBOX = (23.08, 72.53, 23.32, 72.71)

LAYERS = {
    "transport": 'nwr["highway"="bus_stop"];nwr["railway"="station"];nwr["amenity"="bus_station"]',
    "landuse": 'nwr["landuse"~"^(residential|commercial|industrial|farmland|forest|retail|institutional|recreation_ground|cemetery)$"];nwr["natural"~"^(water|wood|scrub|grassland)$"]',
}

HEADERS = {"User-Agent": "hackathon-dataset-prep/1.0", "Accept": "application/json"}


def split_bbox(s, w, n, e, nx, ny):
    out = []
    lat_step = (n - s) / ny
    lon_step = (e - w) / nx
    for i in range(ny):
        for j in range(nx):
            out.append((s + i * lat_step, w + j * lon_step,
                        s + (i + 1) * lat_step, w + (j + 1) * lon_step))
    return out


def fetch(ep, body, timeout=180):
    r = requests.post(ep, data={"data": body}, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json().get("elements", [])


def to_features(elements):
    feats = []
    for el in elements:
        geom = None
        if el.get("lat") is not None:
            geom = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
        elif el.get("center"):
            geom = {"type": "Point", "coordinates": [el["center"]["lon"], el["center"]["lat"]]}
        elif el.get("geometry"):
            gs = el["geometry"]
            if el.get("type") == "way" and len(gs) >= 2:
                geom = {"type": "LineString", "coordinates": [[c["lon"], c["lat"]] for c in gs]}
            else:
                rings = [c for c in gs if len(c) >= 3]
                if rings:
                    coords = [[[c["lon"], c["lat"]] for c in ring] for ring in rings]
                    geom = {"type": "Polygon", "coordinates": coords} if len(coords) == 1 else {"type": "MultiPolygon", "coordinates": [[r] for r in coords]}
        if geom is None:
            continue
        tags = el.get("tags", {})
        props = {"osm_id": el["id"], "osm_type": el.get("type"), "name": tags.get("name", "")}
        for k in ("amenity", "leisure", "shop", "highway", "landuse", "natural", "building", "religion"):
            if k in tags:
                props[k] = tags[k]
        feats.append({"type": "Feature", "properties": props, "geometry": geom})
    return feats


def main():
    log = open(f"{OUT}/gn_fix_log.txt", "a", encoding="utf-8")
    quads = split_bbox(*BBOX, nx=2, ny=2)
    for layer, sub in LAYERS.items():
        all_els = []
        msg = f"== gandhinagar/{layer} =="
        print(msg, flush=True)
        log.write(msg + "\n")
        for qi, qb in enumerate(quads):
            bb = f"{qb[0]},{qb[1]},{qb[2]},{qb[3]}"
            parts = ";".join(f"{s}({bb})" for s in sub.split(";"))
            body = f"[out:json][timeout:120];({parts};);out geom;"
            ok = False
            for attempt in range(5):
                random.shuffle(ENDPOINTS)
                for ep in ENDPOINTS:
                    try:
                        els = fetch(ep, body)
                        all_els.extend(els)
                        msg = f"  quad{qi} ok ({len(els)}) via {ep.split('/')[2]}"
                        print(msg, flush=True)
                        log.write(msg + "\n")
                        log.flush()
                        ok = True
                        break
                    except Exception as e:
                        msg = f"  quad{qi} err {ep}: {e}"
                        print(msg, flush=True)
                        log.write(msg + "\n")
                        log.flush()
                        continue
                if ok:
                    break
                time.sleep(12 * (attempt + 1))
            if not ok:
                msg = f"  quad{qi} FAILED"
                print(msg, flush=True)
                log.write(msg + "\n")
                log.flush()
            time.sleep(6)
        feats = to_features(all_els)
        path = f"{OUT}/gandhinagar_{layer}.geojson"
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False)
        msg = f"  -> saved {path} ({len(feats)} features)"
        print(msg, flush=True)
        log.write(msg + "\n")
        log.flush()
        time.sleep(6)
    log.close()


main()