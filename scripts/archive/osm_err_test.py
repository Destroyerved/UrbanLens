import requests

q = '(nwr["highway"="bus_stop"];nwr["railway"="station"];nwr["amenity"="bus_station"];);'
body = f'[out:json][timeout:60];{q}(22.90,72.44,23.15,72.71);out geom;'
r = requests.post("https://overpass-api.de/api/interpreter", data={"data": body},
                  headers={"User-Agent": "hackathon-dataset-prep/1.0"}, timeout=90)
print("status:", r.status_code)
print(r.text[:800])