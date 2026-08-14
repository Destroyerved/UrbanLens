import requests

bb = "22.90,72.44,23.15,72.71"
queries = {
    "transport": f'(nwr["highway"="bus_stop"]({bb});nwr["railway"="station"]({bb});nwr["amenity"="bus_station"]({bb}););',
    "landuse": f'(nwr["landuse"~"^(residential|commercial|industrial|farmland|forest|retail|institutional|recreation_ground|cemetery)$"]({bb});nwr["natural"~"^(water|wood|scrub|grassland)$"]({bb}););',
}
for name, q in queries.items():
    body = f'[out:json][timeout:90];{q}out geom;'
    ok = False
    for ep in ["https://overpass-api.de/api/interpreter",
               "https://overpass.private.coffee/api/interpreter",
               "https://overpass.kumi.systems/api/interpreter"]:
        try:
            r = requests.post(ep, data={"data": body},
                              headers={"User-Agent": "hackathon-dataset-prep/1.0"}, timeout=120)
            j = r.json()
            print(f"{name} via {ep.split('/')[2]}: status={r.status_code} elems={len(j.get('elements', []))}")
            ok = True
            break
        except Exception as e:
            print(f"{name} via {ep.split('/')[2]}: ERR {type(e).__name__}")
    if not ok:
        print(f"{name}: FAILED")