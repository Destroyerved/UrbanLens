import requests

tests = [
    ("light-node", '[out:json][timeout:60];node["amenity"="school"](22.90,72.44,23.15,72.71);out;'),
    ("light-nwr", '[out:json][timeout:60];nwr["amenity"="school"](22.90,72.44,23.15,72.71);out geom;'),
    ("tiny-bbox", '[out:json][timeout:60];nwr["amenity"~"^(school|college|university|kindergarten)$"](23.10,72.50,23.20,72.60);out geom;'),
]
for name, body in tests:
    print("==", name, "==", flush=True)
    for ep in ["https://overpass.kumi.systems/api/interpreter",
               "https://overpass-api.de/api/interpreter",
               "https://overpass.private.coffee/api/interpreter"]:
        try:
            r = requests.post(ep, data={"data": body},
                              headers={"User-Agent": "hackathon-dataset-prep/1.0"},
                              timeout=60)
            n = len(r.json().get("elements", [])) if r.status_code == 200 else -1
            print(f"  {ep.split('/')[2]:24s} {r.status_code} elements={n}", flush=True)
        except Exception as e:
            print(f"  {ep.split('/')[2]:24s} ERR {type(e).__name__}", flush=True)
