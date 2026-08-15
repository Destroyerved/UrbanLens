import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, LineString

CITIES = {
    "ahmedabad": {
        "wards": "refined/ahmedabad_wards_full.geojson",
        "landuse": "raw/osm/ahmedabad_landuse.geojson",
        "out": "refined/ahmedabad_landuse_by_ward.csv",
    },
    "gandhinagar": {
        "wards": "refined/gandhinagar_wards_full.geojson",
        "landuse": "raw/osm/gandhinagar_landuse.geojson",
        "out": "refined/gandhinagar_landuse_by_ward.csv",
    },
}

AREA_CRS = "EPSG:32643"


from shapely.geometry import LineString


def fix_landuse(gdf):
    geoms = []
    for g in gdf.geometry:
        if g is None:
            geoms.append(None)
        elif g.geom_type in ("Polygon", "MultiPolygon"):
            geoms.append(g)
        elif g.geom_type == "LineString":
            coords = list(g.coords)
            if len(coords) >= 4 and coords[0] == coords[-1]:
                geoms.append(Polygon(coords))
            else:
                geoms.append(None)
        else:
            geoms.append(None)
    gdf = gdf.assign(geometry=geoms)
    gdf = gdf[~gdf.geometry.isna()]
    return gdf.set_geometry("geometry")


def landuse_type(props):
    t = props.get("landuse") or props.get("natural") or props.get("leisure") or "other"
    return t


def landuse_type_row(r):
    t = r.get("landuse") or r.get("natural") or r.get("leisure") or "other"
    return t


for city, cfg in CITIES.items():
    wards = gpd.read_file(cfg["wards"]).to_crs(AREA_CRS)
    lu = gpd.read_file(cfg["landuse"]).to_crs(AREA_CRS)
    lu = fix_landuse(lu)
    if lu.empty:
        print(city, "WARNING: no polygon landuse, skipping")
        continue
    lu["ltype"] = lu.apply(lambda r: landuse_type_row(r), axis=1)

    wards["area_km2"] = wards.geometry.area / 1e6
    inter = gpd.overlay(wards[["ward_id", "name", "geometry"]], lu[["ltype", "geometry"]], how="intersection")
    inter["area_km2"] = inter.geometry.area / 1e6
    inter = inter[inter["area_km2"] > 1e-6]

    pivot = inter.groupby(["ward_id", "name", "ltype"])["area_km2"].sum().reset_index()
    wide = pivot.pivot_table(index=["ward_id", "name"], columns="ltype", values="area_km2",
                             aggfunc="sum", fill_value=0).reset_index()
    wide["total_landuse_km2"] = pivot.groupby(["ward_id", "name"])["area_km2"].sum().values
    warea = wards[["ward_id", "area_km2"]].copy()
    out = wide.merge(warea, on="ward_id", how="left")
    out["ward_area_km2"] = out["area_km2"]
    out = out.drop(columns="area_km2", errors="ignore")
    lcols = [c for c in out.columns if c not in ("ward_id", "name", "total_landuse_km2", "ward_area_km2")]
    for c in lcols:
        out[c + "_pct"] = (out[c] / out["ward_area_km2"] * 100).round(2)
    out = out.sort_values("ward_id")
    out.to_csv(cfg["out"], index=False)
    print(f"{city}: {len(out)} wards, {len(lcols)} landuse types -> {cfg['out']}")
    print(out[["ward_id", "name", "ward_area_km2", "total_landuse_km2"] + [c + "_pct" for c in lcols if c in ('residential', 'industrial', 'commercial')]].round(2).to_string(index=False))
    print()