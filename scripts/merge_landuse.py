import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd

for city in ["ahmedabad", "gandhinagar"]:
    attr = pd.read_csv(f"refined/{city}_ward_attributes.csv")
    lu = pd.read_csv(f"refined/{city}_landuse_by_ward.csv")
    lu = lu[["ward_id"] + [c for c in lu.columns if c.endswith("_pct")]]
    merged = attr.merge(lu, on="ward_id", how="left")
    merged.to_csv(f"refined/{city}_ward_attributes.csv", index=False)
    print(f"{city}: {len(attr)} -> {len(merged)} cols, landuse_pct_cols={len(lu.columns)-1}")