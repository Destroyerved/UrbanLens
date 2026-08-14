import requests

for q in [
    'nwr["highway"="bus_stop"];nwr["railway"="station"];nwr["amenity"="bus_station"]',
    '(nwr["highway"="bus_stop"];nwr["railway"="station"];nwr["amenity"="bus_station"]);',
]:
    body = f'[out:json][timeout:60];{q}(22.90,72.44,23.15,72.71);out center;'
    r = requests.post("https://overpass.private.coffee/api/interpreter",
                      data={"data": body},
                      headers={"User-Agent": "hackathon-dataset-prep/1.0"}, timeout=90)
    print("Q:", q[:40], "->", r.status_code, "elems:", len(r.json().get("elements", [])))
    if r.status_code != 200:
        print("   body:", r.text[:200])