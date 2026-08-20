import json, sys
sys.path.insert(0, r"..\..\backend")
import rasterio
import rasterio.warp
from rasterio.mask import mask
from shapely.geometry import shape
from app.gis.parcels import get_parcels

d = json.load(open(r"..\..\web\data\engine\ahmedabad_observed.json", encoding="utf-8"))
ps = get_parcels("ahmedabad")

count = 0
for p in ps:
    if p.land_use != "agriculture":
        continue
    obs = d["parcels"].get(p.parcel_id) or d["parcels"].get(p.id)
    if not obs:
        continue
    with rasterio.open(r"..\..\datasets\esri\43Q_2024.tif") as src:
        try:
            geom4326 = shape(p.geometry)
            out, tr = mask(
                src,
                [rasterio.warp.transform_geom("EPSG:4326", src.crs, geom4326)],
                crop=True,
                all_touched=False,
            )
        except Exception as e:
            print(p.parcel_id, "skip:", type(e).__name__, str(e)[:40])
            continue
        frac = (out[0] == 7).sum() / max(1, (out[0] > 0).sum())
        print(p.parcel_id, p.land_use, "area~", round(p.area_sqm),
              "json24=", round(obs["2024"]), "direct=", round(frac * 100, 1))
    count += 1
    if count >= 9:
        break