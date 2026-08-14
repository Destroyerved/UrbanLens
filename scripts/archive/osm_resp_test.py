import requests

q = '(nwr["highway"="bus_stop"];nwr["railway"="station"];nwr["amenity"="bus_station"];);'
body = f'[out:json][timeout:60];{q}(22.90,72.44,23.15,72.71);out geom;'
for ep in ["https://overpass.private.coffee/api/interpreter",
           "https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter"]:
    try:
        r = requests.post(ep, data={"data": body},
                          headers={"User-Agent": "hackathon-dataset-prep/1.0"}, timeout=90)
        print(ep.split("/")[2], "status:", r.status_code)
        print("  body head:", r.text[:150].replace("\n", " "))
    except Exception as e:
        print(ep.split("/")[2], "ERR", type(e).__name__)