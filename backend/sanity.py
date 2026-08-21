import sqlite3
import zlib
import orjson
from pyproj import Geod
from shapely.geometry import shape

from pathlib import Path

geod = Geod(ellps="WGS84")

def km2(fc):
    total = 0.0
    for f in fc["features"]:
        try:
            total += abs(geod.geometry_area_perimeter(shape(f["geometry"]))[0])
        except Exception:
            continue
    return total / 1e6

db_path = Path(__file__).resolve().parent / "urbanlens.db"
con = sqlite3.connect(str(db_path))

print("=== DB LAYER SUMMARY ===")
for (layer, data) in con.execute(
    "SELECT layer, data FROM layers WHERE city='ahmedabad' ORDER BY layer"
):
    try:
        fc = orjson.loads(data)
        features = fc.get("features", [])
        print(f"{layer:15s}: {len(features):6d} features  {km2(fc):8.1f} km2")
    except Exception as e:
        print(f"{layer:15s}: error parsing ({e})")

print("\n=== DB JSON CACHE SUMMARY ===")
for (key, city, data) in con.execute(
    "SELECT cache_key, city, data FROM json_cache WHERE city='ahmedabad' ORDER BY cache_key"
):
    try:
        raw = zlib.decompress(data) if isinstance(data, (bytes, bytearray)) else data
        parsed = orjson.loads(raw)
        if isinstance(parsed, dict):
            print(f"{key:22s} ({city}): {len(parsed)} keys")
        elif isinstance(parsed, list):
            print(f"{key:22s} ({city}): {len(parsed)} items")
    except Exception as e:
        print(f"{key:22s} ({city}): error parsing ({e})")