import math, os, sys, time
import requests

GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
LAYER = "MODIS_Terra_Land_Surface_Temp_Day"
DATE = "2026-04-21"
AOI = (72.35, 22.90, 72.85, 23.40)  # west, south, east, north (metro extent)
OUT = os.path.join(os.path.dirname(__file__), "..", "backend", "app", "static", "thermal")
ZOOMS = [8, 9, 10, 11, 12, 13]


def lonlat_to_3857(lon, lat):
    x = lon * 20037508.342789244 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.342789244 / 180
    return x, y


def tile_bbox(x, y, z):
    n = 2 ** z
    lon0 = (x / n) * 360 - 180
    lon1 = ((x + 1) / n) * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    x0, y0 = lonlat_to_3857(lon0, lat0)
    x1, y1 = lonlat_to_3857(lon1, lat1)
    return x0, y0, x1, y1


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def fetch_tile(x, y, z):
    bbox = tile_bbox(x, y, z)
    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetMap",
        "VERSION": "1.1.1",
        "LAYERS": LAYER,
        "STYLES": "",
        "FORMAT": "image/png",
        "TRANSPARENT": "TRUE",
        "TIME": DATE,
        "SRS": "EPSG:3857",
        "WIDTH": 256,
        "HEIGHT": 256,
        "BBOX": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
    }
    r = requests.get(GIBS_WMS, params=params, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    if r.status_code != 200:
        raise RuntimeError(f"WMS error for z{x} y{y} z{z}: {r.status_code} {r.text[:200]}")
    return r.content


def main():
    os.makedirs(OUT, exist_ok=True)
    west, south, east, north = AOI
    total, ok, fail = 0, 0, []
    for z in ZOOMS:
        x0, y_north = tile_xy(west, north, z)
        x1, y_south = tile_xy(east, south, z)
        for x in range(x0, x1 + 1):
            for y in range(min(y_north, y_south), max(y_north, y_south) + 1):
                total += 1
                d = os.path.join(OUT, str(z), str(x))
                os.makedirs(d, exist_ok=True)
                f = os.path.join(d, f"{y}.png")
                if os.path.exists(f) and os.path.getsize(f) > 1000:
                    ok += 1
                    continue
                try:
                    png = fetch_tile(x, y, z)
                    with open(f, "wb") as fh:
                        fh.write(png)
                    ok += 1
                    print(f"z{z} {x}/{y} -> {len(png)} bytes")
                except Exception as e:
                    fail.append((z, x, y, str(e)))
                    print(f"FAIL z{z} {x}/{y}: {e}")
                time.sleep(0.15)
    print(f"\nDone: {ok}/{total} ok, {len(fail)} failed")
    for f in fail[:20]:
        print("  ", f)


if __name__ == "__main__":
    sys.exit(main())