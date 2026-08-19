import geopandas as gpd
from pathlib import Path

INPUT = "data/processed/boundaries/ahmedabad_wards.geojson"
OUTPUT = "data/raw/satellite/ahmedabad_aoi.geojson"

print("=" * 60)
print("URBANLENS — CREATE SATELLITE AREA OF INTEREST")
print("=" * 60)

wards = gpd.read_file(INPUT)

print(f"Wards loaded: {len(wards)}")
print(f"CRS: {wards.crs}")

# Combine all wards into one city boundary
city = wards.dissolve()

# Keep geographic CRS for GeoJSON
city = city.to_crs("EPSG:4326")

# Save
Path(OUTPUT).parent.mkdir(parents=True, exist_ok=True)
city.to_file(OUTPUT, driver="GeoJSON")

print()
print("Ahmedabad AOI created.")
print(f"Output: {OUTPUT}")
print(f"Geometry type: {city.geometry.iloc[0].geom_type}")
print("=" * 60)
