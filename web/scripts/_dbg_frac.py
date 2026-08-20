import importlib.util, sys
from pathlib import Path
import numpy as np
import rasterio, rasterio.warp
from rasterio.windows import from_bounds
p = Path(__file__).resolve().parent / "build-observed.py"
spec = importlib.util.spec_from_file_location("build_observed", p)
b = importlib.util.module_from_spec(spec)
sys.modules["build_observed"] = b
spec.loader.exec_module(b)

box = (72.55, 23.00, 72.60, 23.05)  # dense core
tile = r"..\..\datasets\esri\43Q_2024.tif"
with rasterio.open(tile) as src:
    w, s, e, n = rasterio.warp.transform_bounds("EPSG:4326", src.crs, *box)
    win = from_bounds(w, s, e, n, transform=src.transform)
    raw = src.read(1, window=win)
    frac_raw = (raw == 7).mean()
    block, aff = b._window_and_block(src, w, s, e, n)
    frac_block = (block == 7).mean()
    print("raw 10m frac:", round(frac_raw, 3))
    print("mode-downsampled frac:", round(frac_block, 3))
    print("block shape:", block.shape, "pixel size:", aff.a)

    # now run the exact assignment pipeline for this window
    out_h, out_w = block.shape
    built = block == 7
    tx = b.Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
    tot = np.zeros(1, dtype=np.int64); bc = np.zeros(1, dtype=np.int64)
    xs = (np.arange(out_w, dtype=np.float32) + 0.5) * aff.a + aff.c
    ys = (np.arange(out_h, dtype=np.float32) + 0.5) * aff.e + aff.f
    xx, yy = np.meshgrid(xs, ys)
    lng, lat = tx.transform(xx, yy)
    print("lng range:", lng.min(), lng.max(), "lat range:", lat.min(), lat.max())
    # emulate a fake 1-cell grid covering the window
    ok = (lng >= box[0]) & (lng < box[2]) & (lat >= box[1]) & (lat < box[3])
    print("pixels in box:", int(ok.sum()), "of", ok.size)
    print("frac via assignment:", round(built[ok].mean(), 3))