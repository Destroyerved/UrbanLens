import geopandas as gpd
import pandas as pd

CITIES = {
    "ahmedabad": ("refined/ahmedabad_wards_full.geojson", "refined/ahmedabad_ward_attributes.csv", "datasets/training/features_ahmedabad.csv"),
    "gandhinagar": ("refined/gandhinagar_wards_full.geojson", "refined/gandhinagar_ward_attributes.csv", "datasets/training/features_gandhinagar.csv"),
}

for city, (gdf_path, attr_csv, train_csv) in CITIES.items():
    wards = gpd.read_file(gdf_path)
    roads = gpd.read_file(f"raw/osm/{city}_roads.geojson")
    print(f"== {city} ==  wards={len(wards)}  road-features={len(roads)}", flush=True)

    # project both to UTM 43N for accurate length
    wards_p = wards.to_crs(32643)
    roads_p = roads.to_crs(32643)

    # clip roads to each ward and sum lengths
    road_km = {}
    for _, ward in wards_p.iterrows():
        clipped = gpd.clip(roads_p, ward.geometry)
        length_m = clipped.geometry.length.sum()
        road_km[ward["ward_id"]] = length_m / 1000.0

    wards["road_length_km"] = wards["ward_id"].map(road_km).round(3)
    wards["road_density_km_per_km2"] = (wards["road_length_km"] / wards["area_km2"]).round(3)

    # save back
    wards.to_file(gdf_path, driver="GeoJSON")
    attrs = wards.drop(columns="geometry")
    attrs.to_csv(attr_csv, index=False)
    attrs.to_csv(train_csv, index=False)

    print(attrs[["ward_id", "name", "area_km2", "road_length_km", "road_density_km_per_km2"]].round(2).head(8).to_string(index=False))
    print(f"  total road km: {road_km.values().__round__() if False else round(sum(road_km.values()),1)}")
    print(flush=True)

print("ROADS JOIN DONE")