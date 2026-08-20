import importlib.util, sys
from pathlib import Path
import numpy as np
p = Path(__file__).resolve().parent / "build-observed.py"
spec = importlib.util.spec_from_file_location("build_observed", p)
b = importlib.util.module_from_spec(spec)
sys.modules["build_observed"] = b
spec.loader.exec_module(b)

import sys as s
s.path.insert(0, r"..\..\backend")
from app.data.loader import get_dataset
g = get_dataset("ahmedabad").grid
print("cell_lng", g.cell_lng, "cell_lat", g.cell_lat)
r0, c0 = int((23.02 - g.min_lat) / g.cell_lat), int((72.57 - g.min_lng) / g.cell_lng)
print("dense cell (r,c):", r0, c0, "inCity ward:", g.ward_idx[r0, c0] >= 0)

res = b.process_city("ahmedabad")
tot = res["tot_cnt"]; bc = res["built_cnt"][2024]
for (r, c) in [(r0, c0), (r0, c0+1), (r0-1, c0), (r0+1, c0), (r0, c0-1)]:
    idx = r * g.cols + c
    print(f"cell ({r},{c}): tot={tot[idx]} built={bc[idx]} frac={bc[idx]/max(tot[idx],1):.3f}")