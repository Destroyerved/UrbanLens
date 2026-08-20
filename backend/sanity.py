import sqlite3
import zlib
import orjson
from pyproj import Geod
from shapely.geometry import shape

geod = Geod(ellps="WGS84")

def km2(fc):
    total = 0.0
    for f in fc["features"]:
        try:
            total += abs(geod.geometry_area_perimeter(shape(f["geometry"]))[0])
        except Exception:
            continue
    return total / 1e6

con = sqlite3.connect(r"urbanlens.db")
for (layer, data) in con.execute(
    "SELECT layer, data FROM layers WHERE city='ahmedabad' AND layer LIKE 'builtup_ghsl_%' ORDER BY layer"
):
    fc = orjson.loads(data)
    print(f"{layer}: {len(fc['features']):6d} polygons  {km2(fc):8.1f} km2")

row = con.execute(
    "SELECT data FROM json_cache WHERE cache_key='observed-history' AND city='ahmedabad' ORDER BY length(data) DESC LIMIT 1"
).fetchone()
hist = orjson.loads(row[0])
for pid in list(hist)[:2]:
    print("sample", pid, hist[pid])