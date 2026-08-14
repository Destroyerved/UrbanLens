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

CITIES = {
    "ahmedabad": (22.90, 72.44, 23.15, 72.71),
    "gandhinagar": (23.08, 72.53, 23.32, 72.71),
}

ROAD_QUERY = 'nwr["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]'

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
        tags = el.get("tags", {})
        name = tags.get("name", "")
        highway = tags.get("highway", "")
        if el.get("geometry"):
            coords = [[c["lon"], c["lat"]] for c in el["geometry"]]
            if len(coords) >= 2:
                feats.append({"type": "Feature",
                              "properties": {"osm_id": el["id"], "osm_type": el.get("type"),
                                             "name": name, "highway": highway},
                              "geometry": {"type": "LineString", "coordinates": coords}})
    return feats


def main():
    for city, bbox in CITIES.items():
        print(f"== roads {city} ==", flush=True)
        quads = split_bbox(*bbox, nx=2, ny=2)
        all_els = []
        for qi, qb in enumerate(quads):
            body = f"[out:json][timeout:120];{ROAD_QUERY}({qb[0]},{qb[1]},{qb[2]},{qb[3]});out geom;"
            ok = False
            for attempt in range(4):
                random.shuffle(ENDPOINTS)
                for ep in ENDPOINTS:
                    try:
                        els = fetch(ep, body)
                        all_els.extend(els)
                        print(f"  quad{qi} ok ({len(els)}) via {ep.split('/')[2]}", flush=True)
                        ok = True
                        break
                    except Exception:
                        continue
                if ok:
                    break
                time.sleep(12 * (attempt + 1))
            if not ok:
                print(f"  quad{qi} FAILED", flush=True)
            time.sleep(6)
        feats = to_features(all_els)
        path = f"{OUT}/{city}_roads.geojson"
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False)
        print(f"  -> saved {path} ({len(feats)} roads)", flush=True)
        time.sleep(6)


main()