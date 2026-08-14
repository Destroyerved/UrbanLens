import json
import time
import requests

OUT = "raw/osm"
ENDPOINT = "https://overpass-api.de/api/interpreter"

CITIES = {
    "ahmedabad": (72.44, 22.90, 72.71, 23.15),
    "gandhinagar": (72.53, 23.08, 72.71, 23.32),
}

def q_overpass(bbox, data, name, city, timeout=180):
    s, w, n, e = bbox
    body = f"[out:json][timeout:180];{data}({s},{w},{n},{e});out geom;"
    headers = {
        "User-Agent": "hackathon-dataset-prep/1.0 (urban planning GLIS analytics)",
        "Accept": "application/json, text/plain;q=0.9, */*;q=0.5",
    }
    r = requests.post(ENDPOINT, data={"data": body}, headers=headers, timeout=timeout)
    r.raise_for_status()
    j = r.json()
    elements = j.get("elements", [])
    feats = []
    for el in elements:
        lon = el.get("lon")
        lat = el.get("lat")
        geom = None
        if lon is None and el.get("geometry"):
            rings = [c for c in el["geometry"] if len(c) >= 3]
            if el.get("type") == "way":
                geom = {"type": "LineString", "coordinates": [[c["lon"], c["lat"]] for c in el["geometry"]]}
            elif rings:
                coords = [[[c["lon"], c["lat"]] for c in ring] for ring in rings]
                if el.get("type") == "relation":
                    geom = {"type": "MultiPolygon", "coordinates": [[ring] for ring in coords]}
                else:
                    geom = {"type": "Polygon", "coordinates": coords}
        elif lon is not None:
            geom = {"type": "Point", "coordinates": [lon, lat]}
        if geom is None:
            continue
        props = {"osm_id": el["id"], "osm_type": el.get("type"), "name": el.get("tags", {}).get("name", "")}
        props.update({k: v for k, v in el.get("tags", {}).items() if k in ("amenity", "leisure", "shop", "highway", "landuse", "natural", "building", "tourism", "religion", "office")})
        feats.append({"type": "Feature", "properties": props, "geometry": geom})
    path = f"{OUT}/{city}_{name}.geojson"
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False)
    print(f"{city:12s} {name:12s} -> {len(feats):5d} features  ({path})")

QUERIES = {
    "schools": 'nwr["amenity"~"^(school|college|university|kindergarten)$"]',
    "health": 'nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]',
    "greenspace": 'nwr["leisure"~"^(park|garden|nature_reserve)$"]',
    "transport": 'nwr["highway"~"^(bus_stop)$"];nwr["railway"="station"];nwr["amenity"="bus_station"]',
    "worship": 'nwr["amenity"="place_of_worship"]',
    "landuse": 'nwr["landuse"~"^(residential|commercial|industrial|farmland|forest|retail|institutional|recreation_ground|cemetery)$"];nwr["natural"~"^(water|wood|scrub|grassland)$"]',
}

for city, bbox in CITIES.items():
    for name, data in QUERIES.items():
        for attempt in range(3):
            try:
                q_overpass(bbox, data, name, city)
                break
            except Exception as exc:
                print(f"retry {city}/{name} attempt {attempt+1}: {exc}")
                time.sleep(8)
print("done")