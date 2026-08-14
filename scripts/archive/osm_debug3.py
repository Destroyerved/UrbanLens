import requests

bbox = (22.90, 72.44, 23.15, 72.71)

def split_bbox(s, w, n, e, nx=4, ny=4):
    out = []
    lat_step = (n - s) / ny
    lon_step = (e - w) / nx
    for i in range(ny):
        for j in range(nx):
            out.append((s + i * lat_step, w + j * lon_step,
                        s + (i + 1) * lat_step, w + (j + 1) * lon_step))
    return out

quads = split_bbox(*bbox)
print("quads:", len(quads), flush=True)
body = '[out:json][timeout:60];node["amenity"~"^(school|college|university|kindergarten)$"](22.90,72.44,23.00,72.55);out;'
for ep in ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]:
    try:
        r = requests.post(ep, data={"data": body}, headers={"User-Agent": "hackathon-dataset-prep/1.0"}, timeout=90)
        print(ep.split("/")[2], r.status_code, "elements:", len(r.json().get("elements", [])) if r.status_code == 200 else "-", flush=True)
    except Exception as e:
        print(ep.split("/")[2], "ERR", type(e).__name__, flush=True)
