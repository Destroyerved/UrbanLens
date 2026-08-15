import os
import json
import geopandas as gpd

os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
os.makedirs("logs", exist_ok=True)

L = []
def log(msg):
    L.append(str(msg))
    print(msg, flush=True)

AMC = {
    "Ward_Boundary": "raw/amc/Cultural/8_Ward_Boundary.geojson",
    "Zone_Boundary": "raw/amc/Cultural/9_Zone_Boundary.geojson",
    "Heritage_Property": "raw/amc/Cultural/11_Heritage_Property.geojson",
    "Heritage_Structures": "raw/amc/Cultural/0_Heritage_Structures.geojson",
    "Museum": "raw/amc/Cultural/1_Museum.geojson",
    "Landmarks": "raw/amc/Cultural/2_Landmarks.geojson",
    "Bridges": "raw/amc/Cultural/3_Bridges.geojson",
    "Footpath": "raw/amc/Cultural/4_Footpath.geojson",
    "Hospital": "raw/amc/Health_Facility/0_Hospital.geojson",
    "UHC": "raw/amc/Health_Facility/1_UHC.geojson",
    "Parks_Garden": "raw/amc/Recreational_Services/0_Parks_Garden.geojson",
    "Municipal_Library": "raw/amc/Recreational_Services/1_Municipal_Library.geojson",
    "Vidhansabha_Boundary": "raw/amc/Our_Ahmedabad/6_Vidhansabha_Boundary.geojson",
    "Loksabha_Boundary": "raw/amc/Our_Ahmedabad/7_Loksabha_Boundary.geojson",
}

for name, p in AMC.items():
    if os.path.exists(p):
        g = gpd.read_file(p)
        log(f"AMC {name}: {len(g)} feats")
    else:
        log(f"AMC {name}: MISSING")

log("")
# OSM counts for overlap comparison
OSM = {
    "health": ["ahmedabad_health", "gandhinagar_health"],
    "greenspace": ["ahmedabad_greenspace", "gandhinagar_greenspace"],
    "roads": ["ahmedabad_roads", "gandhinagar_roads"],
    "wards": ["ahmedabad_wards", "gandhinagar_wards"],
}
for name, files in OSM.items():
    tot = 0
    for f in files:
        p = f"raw/osm/{f}.geojson"
        if os.path.exists(p):
            tot += len(gpd.read_file(p))
    log(f"OSM {name}: {tot} feats")

# Spatial comparison: UHC vs OSM health (point-in-point proximity), Hospital vs OSM health
log("")
amc_hosp = gpd.read_file(AMC["Hospital"]).to_crs(32643)
amc_uhc = gpd.read_file(AMC["UHC"]).to_crs(32643)
osm_health = gpd.read_file("raw/osm/ahmedabad_health.geojson")
if len(osm_health):
    osm_health = osm_health.to_crs(32643)
    def near_count(amc_gdf, radius_m):
        return sum(amc_gdf.distance(osm_health.geometry.unary_union) < radius_m)
    log(f"AMC hospitals within 1km of any OSM health point: {near_count(amc_hosp, 1000)}/{len(amc_hosp)}")
    log(f"AMC UHCs within 1km of any OSM health point: {near_count(amc_uhc, 1000)}/{len(amc_uhc)}")
    log(f"AMC UHCs within 500m: {near_count(amc_uhc, 500)}/{len(amc_uhc)}")

# Parks: AMC park polygon centroid within X m of OSM greenspace
log("")
amc_parks = gpd.read_file(AMC["Parks_Garden"]).to_crs(32643)
amc_parks_cent = gpd.GeoDataFrame(geometry=amc_parks.geometry.representative_point(), crs=32643)
osm_green = gpd.read_file("raw/osm/ahmedabad_greenspace.geojson")
if len(osm_green):
    osm_green = osm_green.to_crs(32643)
    d = amc_parks_cent.distance(osm_green.geometry.unary_union)
    log(f"AMC parks centroid within 300m of OSM greenspace: {(d < 300).sum()}/{len(amc_parks)}")

# AMC ward boundary vs our wards
log("")
amc_wards = gpd.read_file(AMC["Ward_Boundary"])
our_wards = gpd.read_file("refined/ahmedabad_wards_full.geojson")
log(f"AMC ward_count={len(amc_wards)} vs our AHM wards={len(our_wards)}")
log(f"AMC ward names: {sorted(amc_wards['ward_name'].tolist())[:8]} ...")
log(f"Our ward names: {sorted(our_wards['name'].tolist())[:8]} ...")

with open("logs/amc_osm_compare.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(L))
log("")
log("written logs/amc_osm_compare.txt")
