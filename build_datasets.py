import math
import geopandas as gpd
import pandas as pd
import numpy as np

pd.set_option("display.width", 200)

def geometry_features(gdf):
    g = gdf.to_crs(32643)  # UTM zone 43N for WGS84
    area_m2 = g.geometry.area
    perim_m = g.geometry.length
    f = gdf.copy()
    f["area_m2"] = area_m2
    f["area_km2"] = area_m2 / 1e6
    f["perimeter_m"] = perim_m
    f["perimeter_km"] = perim_m / 1e3
    f["compactness"] = (4 * math.pi * area_m2 / perim_m**2).replace([np.inf, -np.inf], np.nan)
    f["centroid_lon"] = f.geometry.centroid.x
    f["centroid_lat"] = f.geometry.centroid.y
    return f

# ---------------- Gandhinagar attributes (from official raw) ----------------
raw = gpd.read_file("raw/gandhinagar_wards.geojson")
attr_cols = {
    "zone": "first",
    "zone_id": "first",
    "ward_name": "first",
    "vill_name": "first",
    "sector_no": "first",
    "no_of_sch": "first",
    "no_med_fac": "first",
    "no_of_inst": "first",
    "govt_prima": "first",
    "total_popu": "first",
    "male_popul": "first",
    "female_pop": "first",
    "total_hous": "first",
    "shape_area": "sum",
    "shape_leng": "sum",
}
attrs = raw.dissolve(by="ward_no", as_index=True, aggfunc=attr_cols).reset_index()
attrs["ward_id"] = attrs["ward_no"]
attrs["name"] = attrs["ward_name"]
attrs = attrs[["ward_id", "name", "zone", "zone_id", "vill_name", "sector_no",
               "no_of_sch", "no_med_fac", "no_of_inst", "govt_prima",
               "total_popu", "male_popul", "female_pop", "total_hous",
               "shape_area", "shape_leng", "geometry"]]
attrs = geometry_features(attrs)
attrs = attrs[["ward_id", "name", "zone", "zone_id", "vill_name", "sector_no",
               "no_of_sch", "no_med_fac", "no_of_inst", "govt_prima",
               "total_popu", "male_popul", "female_pop", "total_hous",
               "shape_area", "shape_leng", "area_m2", "area_km2", "perimeter_m",
               "perimeter_km", "compactness", "centroid_lon", "centroid_lat",
               "geometry"]]
attrs.to_file("refined/gandhinagar_wards_full.geojson", driver="GeoJSON")
attrs.drop(columns="geometry").to_csv("refined/gandhinagar_ward_attributes.csv", index=False)
print("Gandhinagar full wards + attributes:", len(attrs), "wards")
print(attrs[["ward_id", "name", "zone", "area_km2", "compactness"]].round(3).to_string(index=False))

# ---------------- Gandhinagar zones ----------------
zones = attrs.dissolve(by="zone", aggfunc={"zone_id": "first"}).reset_index()
zones = zones[["zone", "zone_id", "geometry"]]
zones["zone_area_km2"] = zones.to_crs(32643).geometry.area / 1e6
zones.to_file("refined/gandhinagar_zones.geojson", driver="GeoJSON")
print("\nZones:", zones[["zone", "zone_area_km2"]].round(2).to_string(index=False))

# ---------------- Ahmedabad base (attributes come later via OSM join) ----------------
ahm = gpd.read_file("refined/ahmedabad_wards.geojson")
ahm = geometry_features(ahm)
ahm.to_file("refined/ahmedabad_wards_full.geojson", driver="GeoJSON")
ahm.drop(columns="geometry").to_csv("refined/ahmedabad_ward_attributes.csv", index=False)
print("\nAhmedabad full wards + geometry features:", len(ahm), "wards")
print(ahm[["ward_id", "name", "area_km2", "compactness"]].round(3).head(6).to_string(index=False))

# ---------------- ML training CSVs ----------------
attr_csv = attrs.drop(columns="geometry")
attr_csv.to_csv("datasets/training/features_gandhinagar.csv", index=False)
ahm_csv = ahm.drop(columns="geometry")
ahm_csv.to_csv("datasets/training/features_ahmedabad.csv", index=False)
print("\nTraining CSVs written.")

# ---------------- Point samples (for geocoding/classification models) ----------------
def sample_points(gdf, n_per_ward, seed=42):
    rng = np.random.default_rng(seed)
    rows = []
    for _, w in gdf.iterrows():
        minx, miny, maxx, maxy = w.geometry.bounds
        got = 0
        tries = 0
        while got < n_per_ward and tries < n_per_ward * 50:
            tries += 1
            lon = rng.uniform(minx, maxx)
            lat = rng.uniform(miny, maxy)
            p = gpd.points_from_xy([lon], [lat], crs=gdf.crs)[0]
            if w.geometry.contains(p):
                rows.append({"ward_id": w["ward_id"], "name": w["name"],
                             "lon": lon, "lat": lat})
                got += 1
    return pd.DataFrame(rows)

pts_g = sample_points(attrs, n_per_ward=200)
pts_a = sample_points(ahm, n_per_ward=200)
pts_g.to_csv("datasets/training/points_sample_gandhinagar.csv", index=False)
pts_a.to_csv("datasets/training/points_sample_ahmedabad.csv", index=False)
print(f"\nPoint samples: Gandhinagar {len(pts_g)} pts, Ahmedabad {len(pts_a)} pts")
print("\nALL NON-OSM PARTS DONE")