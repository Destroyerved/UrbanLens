import requests

transport = '(nwr["highway"="bus_stop"];nwr["railway"="station"];nwr["amenity"="bus_station"];);'
landuse = '(nwr["landuse"~"^(residential|commercial|industrial|farmland|forest|retail|institutional|recreation_ground|cemetery)$"];nwr["natural"~"^(water|wood|scrub|grassland)$"];);'

for name, q in [("transport", transport), ("landuse", landuse)]:
    body = f'[out:json][timeout:90];{q}(22.90,72.44,23.15,72.71);out geom;'
    ok = False
    for ep in ["https://overpass.private.coffee/api/interpreter",
               "https://overpass-api.de/api/interpreter",
               "https://overpass.kumi.systems/api/interpreter"]:
        try:
            r = requests.post(ep, data={"data": body},
                              headers={"User-Agent": "hackathon-dataset-prep/1.0"},
                              timeout=120)
            els = r.json().get("elements", [])
            print(f"{name} via {ep.split('/')[2]}: status={r.status_code} elems={len(els)}")
            ok = True
            break
        except Exception as e:
            print(f"{name} via {ep.split('/')[2]}: ERR {type(e).__name__}")
    if not ok:
        print(f"{name}: FAILED")