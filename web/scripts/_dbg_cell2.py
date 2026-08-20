import importlib.util, sys
from pathlib import Path
import numpy as np
import rasterio
p = Path(__file__).resolve().parent / "build-observed.py"
spec = importlib.util.spec_from_file_location("build_observed", p)
b = importlib.util.module_from_spec(spec)
sys.modules["build_observed"] = b
spec.loader.exec_module(b)

sys.path.insert(0, r"..\..\backend")
from app.data.loader import get_dataset
g = get_dataset("ahmedabad").grid
r0, c0 = int((23.02 - g.min_lat) / g.cell_lat), int((72.57 - g.min_lng) / g.cell_lng)
lat0 = g.min_lat + r0 * g.cell_lat
lng0 = g.min_lng + c0 * g.cell_lng
print(f"cell ({r0},{c0}) bounds lng {lng0:.6f}-{lng0+g.cell_lng:.6f} lat {lat0:.6f}-{lat0+g.cell_lat:.6f}")

with rasterio.open(r"..\..\datasets\esri\43Q_2024.tif") as src:
    west, south, east, north = rasterio.warp.transform_bounds(
        "EPSG:4326", src.crs, g.min_lng, g.min_lat,
        g.min_lng + g.cols * g.cell_lng, g.min_lat + g.rows * g.cell_lat)
    block, new_aff = b._window_and_block(src, west, south, east, north)
out_h, out_w = block.shape
print("block", block.shape, "px size", new_aff.a, new_aff.e)
tx = b.Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
cnt = 0; built = 0
for start in range(0, out_h, b.CHUNK_ROWS):
    end = min(out_h, start + b.CHUNK_ROWS)
    xs = (np.arange(out_w, dtype=np.float32) + 0.5) * new_aff.a + new_aff.c
    ys = (np.arange(start, end, dtype=np.float32) + 0.5) * new_aff.e + new_aff.f
    xx, yy = np.meshgrid(xs, ys)
    lng, lat = tx.transform(xx, yy)
    r = np.floor((lat - g.min_lat) / g.cell_lat).astype(np.int64)
    c = np.floor((lng - g.min_lng) / g.cell_lng).astype(np.int64)
    m = (r == r0) & (c == c0)
    if m.any():
        cnt += int(m.sum())
        built += int((block[start:end] == 7).ravel()[m.ravel()].sum())
print("pixels assigned to cell:", cnt, "built:", built, "frac:", round(built / cnt, 3))
print("expected ~", int(round((g.cell_lng * 102.5) / (new_aff.a / 111320)) ** 2), "pixels at 30m")