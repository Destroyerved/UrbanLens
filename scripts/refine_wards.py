import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import re
import geopandas as gpd


def refine_ahmedabad(src, dst):
    wards = gpd.read_file(src)
    wards = wards.to_crs("EPSG:4326")
    wards = wards[wards.geometry.is_valid]
    wards = wards.copy()
    wards["ward_id"] = wards["Name"].apply(
        lambda n: int(re.match(r"\s*(\d+)", str(n)).group(1))
    )
    wards["name"] = wards["Name"].apply(
        lambda n: re.sub(r"^\s*\d+\s*", "", str(n)).strip()
    )
    wards = wards[["ward_id", "name", "geometry"]]
    wards = wards.sort_values("ward_id").reset_index(drop=True)
    wards.to_file(dst, driver="GeoJSON")


def refine_gandhinagar(src, dst):
    wards = gpd.read_file(src)
    wards = wards.to_crs("EPSG:4326")
    wards = wards[wards.geometry.is_valid]
    wards = wards.copy()
    wards["ward_id"] = wards["ward_no"].astype(int)
    wards["name"] = wards["ward_name"]
    wards = wards[["ward_id", "name", "geometry"]]
    dissolved = wards.dissolve(by="ward_id", as_index=False).sort_values(
        "ward_id"
    ).reset_index(drop=True)
    dissolved.to_file(dst, driver="GeoJSON")


refine_ahmedabad("raw/ahmedabad_wards.geojson", "refined/ahmedabad_wards.geojson")
refine_gandhinagar("raw/gandhinagar_wards.geojson", "refined/gandhinagar_wards.geojson")
print("done")