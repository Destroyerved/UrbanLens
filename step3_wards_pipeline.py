import os
import requests
import geopandas as gpd
import rasterio
from rasterstats import zonal_stats
from shapely.geometry import Point

# ============================================================
# URBANLENS — STEP 3
# Ahmedabad Ward Infrastructure Pipeline
#
# PURPOSE:
# Convert raw geospatial data into ward-level analytical
# features that can be consumed by the priority engine.
# ============================================================

WARD_FILE = "data/ahmedabad_wards.geojson"
POPULATION_RASTER = "data/ind_ppp_2020.tif"
OUTPUT_FILE = "output/ahmedabad_wards_base.geojson"

WARD_NAME_COL = "Name"

# Ahmedabad bounding box
SOUTH = 22.90
WEST = 72.40
NORTH = 23.20
EAST = 72.75

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

HEADERS = {
    "User-Agent": "UrbanLens-Hackathon/1.0"
}

# Metric CRS for distance calculations
METRIC_CRS = "EPSG:32643"


# ============================================================
# OVERPASS HELPER
# ============================================================

def query_overpass(amenity):

    print(f"Downloading {amenity}s from OpenStreetMap...")

    query = f"""
    [out:json][timeout:90];

    (
      node["amenity"="{amenity}"](
        {SOUTH},{WEST},{NORTH},{EAST}
      );

      way["amenity"="{amenity}"](
        {SOUTH},{WEST},{NORTH},{EAST}
      );

      relation["amenity"="{amenity}"](
        {SOUTH},{WEST},{NORTH},{EAST}
      );
    );

    out center tags;
    """

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

        # Ways and relations provide center coordinates
        if lat is None or lon is None:

            center = element.get("center", {})

            lat = center.get("lat")
            lon = center.get("lon")

        if lat is None or lon is None:
            continue

        rows.append({
            "amenity": amenity,
            "name": tags.get("name", "Unknown"),
            "latitude": lat,
            "longitude": lon,
            "geometry": Point(lon, lat)
        })

    gdf = gpd.GeoDataFrame(
        rows,
        geometry="geometry",
        crs="EPSG:4326"
    )

    print(
        f"Found {len(gdf)} {amenity} features."
    )

    return gdf


# ============================================================
# HEADER
# ============================================================

print()
print("==============================================")
print("URBANLENS — STEP 3")
print("Ahmedabad Ward Infrastructure Pipeline")
print("==============================================")
print()


# ============================================================
# STEP 1 — LOAD WARDS
# ============================================================

print("Loading Ahmedabad ward boundaries...")

wards = gpd.read_file(WARD_FILE)

print(f"Loaded {len(wards)} wards.")

print(
    "Ward columns:",
    wards.columns.tolist()
)

if WARD_NAME_COL not in wards.columns:

    raise ValueError(
        f"Column '{WARD_NAME_COL}' not found. "
        f"Available columns: {wards.columns.tolist()}"
    )


# Remove invalid geometries

wards = wards[
    wards.geometry.notna()
].copy()


# Ensure CRS exists

if wards.crs is None:

    wards = wards.set_crs(
        "EPSG:4326"
    )


wards = wards.to_crs(
    "EPSG:4326"
)


# ============================================================
# STEP 2 — POPULATION FROM WORLDPOP
# ============================================================

print()
print(
    "Calculating population per ward "
    "from WorldPop..."
)

with rasterio.open(
    POPULATION_RASTER
) as src:

    raster_crs = src.crs

    wards_for_raster = (
        wards
        .to_crs(raster_crs)
    )

    stats = zonal_stats(
        wards_for_raster.geometry,
        POPULATION_RASTER,
        stats=["sum"],
        nodata=src.nodata
    )


wards["population"] = [

    int(
        round(
            s["sum"] or 0
        )
    )

    for s in stats

]


print(
    "Total estimated population:",
    f"{wards['population'].sum():,}"
)


# ============================================================
# STEP 3 — DOWNLOAD HEALTHCARE FACILITIES
# ============================================================

hospitals = query_overpass(
    "hospital"
)


# ============================================================
# STEP 4 — DOWNLOAD SCHOOLS
# ============================================================

schools = query_overpass(
    "school"
)


# ============================================================
# STEP 5 — ASSIGN HOSPITALS TO WARDS
# ============================================================

print()
print(
    "Assigning hospitals to wards..."
)

if len(hospitals) > 0:

    hospitals_joined = gpd.sjoin(

        hospitals,

        wards[
            [
                WARD_NAME_COL,
                "geometry"
            ]
        ],

        predicate="within",

        how="left"
    )

    hospital_counts = (

        hospitals_joined
        .groupby(WARD_NAME_COL)
        .size()

    )

    wards["hospital_count"] = (

        wards[WARD_NAME_COL]
        .map(hospital_counts)
        .fillna(0)
        .astype(int)

    )

else:

    wards["hospital_count"] = 0


# ============================================================
# STEP 6 — ASSIGN SCHOOLS TO WARDS
# ============================================================

print(
    "Assigning schools to wards..."
)

if len(schools) > 0:

    schools_joined = gpd.sjoin(

        schools,

        wards[
            [
                WARD_NAME_COL,
                "geometry"
            ]
        ],

        predicate="within",

        how="left"
    )

    school_counts = (

        schools_joined
        .groupby(WARD_NAME_COL)
        .size()

    )

    wards["school_count"] = (

        wards[WARD_NAME_COL]
        .map(school_counts)
        .fillna(0)
        .astype(int)

    )

else:

    wards["school_count"] = 0


# ============================================================
# STEP 7 — DISTANCE TO NEAREST HOSPITAL
# ============================================================

print()
print(
    "Calculating distance to nearest hospital..."
)

wards_metric = wards.to_crs(
    METRIC_CRS
)

if len(hospitals) > 0:

    hospitals_metric = hospitals.to_crs(
        METRIC_CRS
    )

    ward_centroids = (
        wards_metric
        .geometry
        .centroid
    )

    nearest_distances = []

    for centroid in ward_centroids:

        distances = (
            hospitals_metric
            .geometry
            .distance(centroid)
        )

        if len(distances) > 0:

            nearest_distance_km = (
                distances.min() / 1000
            )

        else:

            nearest_distance_km = None

        nearest_distances.append(
            nearest_distance_km
        )

    wards[
        "nearest_hospital_dist_km"
    ] = nearest_distances

else:

    wards[
        "nearest_hospital_dist_km"
    ] = None


# ============================================================
# STEP 8 — INFRASTRUCTURE NEED
# ============================================================

print()
print(
    "Calculating infrastructure need..."
)


# ------------------------------------------------------------
# Population pressure
# ------------------------------------------------------------

max_population = (
    wards["population"].max()
)

if max_population > 0:

    population_pressure = (

        wards["population"]
        / max_population

    )

else:

    population_pressure = 0


# ------------------------------------------------------------
# Hospital deficit
# ------------------------------------------------------------

max_hospitals = (
    wards["hospital_count"].max()
)

if max_hospitals > 0:

    hospital_deficit = (

        1 -
        (
            wards["hospital_count"]
            / max_hospitals
        )

    )

else:

    hospital_deficit = 1


# ------------------------------------------------------------
# School deficit
# ------------------------------------------------------------

max_schools = (
    wards["school_count"].max()
)

if max_schools > 0:

    school_deficit = (

        1 -
        (
            wards["school_count"]
            / max_schools
        )

    )

else:

    school_deficit = 1


# ------------------------------------------------------------
# Healthcare distance pressure
# ------------------------------------------------------------

distance_series = (
    wards["nearest_hospital_dist_km"]
)


if distance_series.notna().any():

    max_distance = (
        distance_series.max()
    )

    min_distance = (
        distance_series.min()
    )

    if max_distance > min_distance:

        hospital_access_gap = (

            (
                distance_series
                - min_distance
            )
            /
            (
                max_distance
                - min_distance
            )

        )

    else:

        hospital_access_gap = 0

else:

    hospital_access_gap = 1


wards[
    "population_pressure"
] = population_pressure.round(4)


wards[
    "hospital_deficit"
] = hospital_deficit.round(4)


wards[
    "school_deficit"
] = school_deficit.round(4)


wards[
    "hospital_access_gap"
] = (
    hospital_access_gap
    .fillna(1)
    .round(4)
)


# ============================================================
# COMPOSITE INFRASTRUCTURE NEED SCORE
# ============================================================

wards[
    "infrastructure_need_score"
] = (

    0.40 *
    wards["population_pressure"]

    +

    0.30 *
    wards["hospital_access_gap"]

    +

    0.20 *
    wards["hospital_deficit"]

    +

    0.10 *
    wards["school_deficit"]

).clip(0, 1).round(4)


# ============================================================
# STEP 9 — SAVE
# ============================================================

print()
print(
    "Saving ward dataset..."
)

os.makedirs(
    "output",
    exist_ok=True
)

wards.to_file(
    OUTPUT_FILE,
    driver="GeoJSON"
)


# ============================================================
# RESULTS
# ============================================================

print()
print("==============================================")
print("URBANLENS STEP 3 COMPLETE")
print("==============================================")

print(
    f"Wards: {len(wards)}"
)

print(
    f"Hospitals: {len(hospitals)}"
)

print(
    f"Schools: {len(schools)}"
)

print(
    f"Total population: "
    f"{wards['population'].sum():,}"
)

print(
    f"Output: {OUTPUT_FILE}"
)

print("==============================================")

print()
print(
    "TOP 10 WARDS BY INFRASTRUCTURE NEED"
)

print()

print(

    wards[
        [
            WARD_NAME_COL,
            "population",
            "hospital_count",
            "school_count",
            "nearest_hospital_dist_km",
            "infrastructure_need_score"
        ]
    ]

    .sort_values(
        "infrastructure_need_score",
        ascending=False
    )

    .head(10)

    .to_string(
        index=False
    )

)

print()
