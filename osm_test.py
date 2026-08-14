import requests

body = '[out:json][timeout:60];nwr["amenity"~"^(school|college|university|kindergarten)$"](22.90,72.44,23.15,72.71);out geom;'
headers = {"User-Agent": "hackathon-dataset-prep/1.0", "Accept": "application/json"}
r = requests.post("https://overpass-api.de/api/interpreter", data={"data": body}, headers=headers, timeout=90)
print("status:", r.status_code)
print("len:", len(r.text))
print(r.text[:300])