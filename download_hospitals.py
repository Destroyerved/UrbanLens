import requests
import geopandas as gpd
from shapely.geometry import Point

print("""
==============================================
URBANLENS — HOSPITAL DATASET
Downloading Ahmedabad hospitals
==============================================
""")

SOUTH = 22.90
WEST = 72.40
NORTH = 23.20
EAST = 72.75

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

HEADERS = {
    "User-Agent": "UrbanLens-Hackathon/1.0 (Ahmedabad geospatial research prototype)"
}

query = f"""
[out:json][timeout:90];
(
  node["amenity"="hospital"]({SOUTH},{WEST},{NORTH},{EAST});
  way["amenity"="hospital"]({SOUTH},{WEST},{NORTH},{EAST});
  relation["amenity"="hospital"]({SOUTH},{WEST},{NORTH},{EAST});
);
out center tags;
"""

print("Downloading hospitals from OpenStreetMap...")

response = requests.post(
    OVERPASS_URL,
    data={"data": query},
    headers=HEADERS,
    timeout=120
)

response.raise_for_status()

data = response.json()

rows = []

for element in data.get("elements", []):

    tags = element.get("tags", {})

    lat = element.get("lat")
    lon = element.get("lon")

    if lat is None or lon is None:
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")

    if lat is None or lon is None:
        continue

    rows.append({
        "name": tags.get("name", "Unknown"),
        "latitude": lat,
        "longitude": lon,
        "geometry": Point(lon, lat)
    })

hospitals = gpd.GeoDataFrame(
    rows,
    geometry="geometry",
    crs="EPSG:4326"
)

print(f"Found {len(hospitals)} hospitals.")

hospitals.to_file(
    "output/ahmedabad_hospitals.geojson",
    driver="GeoJSON"
)

print()
print("==============================================")
print("HOSPITAL DATASET COMPLETE")
print("==============================================")
print(f"Hospitals saved: {len(hospitals)}")
print("Output: output/ahmedabad_hospitals.geojson")
print("==============================================")
