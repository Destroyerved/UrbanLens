import requests

body = '[out:json][timeout:60];nwr["amenity"~"^(school|college|university|kindergarten)$"](22.90,72.44,23.15,72.71);out geom;'
for ep in ["https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter",
           "https://overpass.osm.jp/api/interpreter",
           "https://overpass-api.de/api/interpreter"]:
    try:
        r = requests.post(ep, data={"data": body},
                          headers={"User-Agent": "hackathon-dataset-prep/1.0", "Accept": "application/json"},
                          timeout=120)
        print(ep.split("/")[2], r.status_code, len(r.text))
        if r.status_code == 200:
            j = r.json()
            print("   elements:", len(j.get("elements", [])))
            if j.get("elements"):
                print("   sample:", j["elements"][0].get("tags", {}).get("name"), j["elements"][0].get("lat"))
    except Exception as e:
        print(ep.split("/")[2], "ERR", type(e).__name__, str(e)[:100])
