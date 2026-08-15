import os
import numpy as np
import geopandas as gpd
import osmnx as ox
from shapely.geometry import box
from sklearn.preprocessing import MinMaxScaler

# ============================================================
# URBANLENS — STEP 5
# Land Suitability / Candidate Site Selection Engine
#
# PURPOSE:
#
# Identify geographically suitable candidate locations for
# a new healthcare facility.
#
# IMPORTANT:
# These are CANDIDATE LOCATIONS, not claimed legal parcels.
# Land ownership is deliberately not fabricated.
# ============================================================

WARD_FILE = "output/ahmedabad_wards_priority.geojson"
OUTPUT_FILE = "output/parcels_scored.geojson"

PLACE = "Ahmedabad, Gujarat, India"

# Ahmedabad / UTM Zone 43N
METRIC_CRS = "EPSG:32643"

# Candidate grid resolution
GRID_SIZE = 0.005


# ============================================================
# HEADER
# ============================================================

print("""
==============================================
URBANLENS — STEP 5
Candidate Site Selection Engine
==============================================
""")


# ============================================================
# STEP 1 — LOAD PRIORITIZED WARDS
# ============================================================

print("Loading prioritized Ahmedabad wards...")

wards = gpd.read_file(
    WARD_FILE
)

print(
    f"Loaded {len(wards)} wards."
)


# ============================================================
# STEP 2 — CREATE CANDIDATE GRID
# ============================================================

print(
    "Generating candidate locations..."
)

wards_wgs84 = (
    wards
    .to_crs("EPSG:4326")
)


minx, miny, maxx, maxy = (
    wards_wgs84.total_bounds
)


grid_cells = []

x = minx

while x < maxx:

    y = miny

    while y < maxy:

        cell = box(
            x,
            y,
            x + GRID_SIZE,
            y + GRID_SIZE
        )

        grid_cells.append(
            cell
        )

        y += GRID_SIZE

    x += GRID_SIZE


grid = gpd.GeoDataFrame(
    {
        "geometry": grid_cells
    },
    crs="EPSG:4326"
)


print(
    f"Generated {len(grid)} raw candidate cells."
)


# ============================================================
# STEP 3 — CLIP TO AHMEDABAD
# ============================================================

print(
    "Clipping candidates to Ahmedabad..."
)


city_boundary = (
    wards_wgs84
    .geometry
    .union_all()
)


grid = grid[
    grid.geometry.intersects(
        city_boundary
    )
].copy()


grid.reset_index(
    drop=True,
    inplace=True
)


print(
    f"Candidate cells after clipping: "
    f"{len(grid)}"
)


# ============================================================
# STEP 4 — ASSIGN CANDIDATES TO WARDS
# ============================================================

print(
    "Assigning candidate locations to wards..."
)


ward_columns = [
    "Name",
    "population",
    "hospital_count",
    "school_count",
    "priority_score",
    "priority_level",
    "infrastructure_need_score"
]


ward_subset = (
    wards_wgs84[
        ward_columns + ["geometry"]
    ]
    .copy()
)


grid = gpd.sjoin(
    grid,
    ward_subset,
    how="left",
    predicate="intersects"
)


if "index_right" in grid.columns:

    grid.drop(
        columns=["index_right"],
        inplace=True
    )


# One candidate should belong to one ward.

grid = (
    grid
    .drop_duplicates(
        subset=["geometry"]
    )
    .copy()
)


grid.reset_index(
    drop=True,
    inplace=True
)


# Candidate IDs

grid["candidate_id"] = [

    "AHD-CAND-" +
    str(i).zfill(5)

    for i in range(
        len(grid)
    )

]


print(
    f"Unique candidate locations: "
    f"{len(grid)}"
)


# ============================================================
# STEP 5 — CONVERT TO METRIC CRS
# ============================================================

grid_metric = (
    grid
    .to_crs(METRIC_CRS)
)


# ============================================================
# STEP 6 — ROAD ACCESSIBILITY
# ============================================================

print()
print(
    "Downloading road network from OpenStreetMap..."
)


try:

    roads = ox.features_from_place(
        PLACE,
        tags={
            "highway": True
        }
    )

    roads = roads[
        roads.geometry.notna()
    ].copy()


    roads = roads[
        ~roads.geometry.is_empty
    ].copy()


    roads = roads.to_crs(
        METRIC_CRS
    )


    print(
        f"Found {len(roads)} road features."
    )


except Exception as e:

    print(
        "WARNING: Could not download roads."
    )

    print(
        "Reason:",
        e
    )

    roads = None


# ------------------------------------------------------------
# Calculate distance to road
# ------------------------------------------------------------

if (
    roads is not None
    and len(roads) > 0
):

    road_union = (
        roads.geometry
        .union_all()
    )


    grid_metric[
        "dist_to_road_m"
    ] = (

        grid_metric
        .geometry
        .centroid
        .distance(
            road_union
        )

    )

else:

    print(
        "Using fallback road distances."
    )

    # Conservative fallback rather than random
    grid_metric[
        "dist_to_road_m"
    ] = 1000


# ============================================================
# STEP 7 — PUBLIC TRANSPORT ACCESS
# ============================================================

print()
print(
    "Downloading bus stops..."
)


try:

    bus_stops = ox.features_from_place(
        PLACE,
        tags={
            "highway": "bus_stop"
        }
    )


    bus_stops = bus_stops[
        bus_stops.geometry.notna()
    ].copy()


    bus_stops = bus_stops[
        ~bus_stops.geometry.is_empty
    ].copy()


    bus_stops = bus_stops.to_crs(
        METRIC_CRS
    )


    print(
        f"Found {len(bus_stops)} bus stops."
    )


except Exception as e:

    print(
        "WARNING: Could not download bus stops."
    )

    print(
        "Reason:",
        e
    )

    bus_stops = None


if (
    bus_stops is not None
    and len(bus_stops) > 0
):

    bus_union = (
        bus_stops.geometry
        .union_all()
    )


    grid_metric[
        "dist_to_bus_m"
    ] = (

        grid_metric
        .geometry
        .centroid
        .distance(
            bus_union
        )

    )

else:

    grid_metric[
        "dist_to_bus_m"
    ] = 2000


# ============================================================
# STEP 8 — EXISTING HOSPITAL ACCESS
# ============================================================

print()
print(
    "Downloading existing hospitals..."
)


try:

    hospitals = ox.features_from_place(
        PLACE,
        tags={
            "amenity": "hospital"
        }
    )


    hospitals = hospitals[
        hospitals.geometry.notna()
    ].copy()


    hospitals = hospitals[
        ~hospitals.geometry.is_empty
    ].copy()


    hospitals = hospitals.to_crs(
        METRIC_CRS
    )


    print(
        f"Found {len(hospitals)} hospitals."
    )


except Exception as e:

    print(
        "WARNING: Could not download hospitals."
    )

    print(
        "Reason:",
        e
    )

    hospitals = None


if (
    hospitals is not None
    and len(hospitals) > 0
):

    hospital_union = (
        hospitals.geometry
        .union_all()
    )


    grid_metric[
        "dist_to_hospital_m"
    ] = (

        grid_metric
        .geometry
        .centroid
        .distance(
            hospital_union
        )

    )

else:

    grid_metric[
        "dist_to_hospital_m"
    ] = 3000


# ============================================================
# STEP 9 — POPULATION NEED
# ============================================================

print()
print(
    "Calculating population need..."
)


grid_metric[
    "nearby_population"
] = (

    grid_metric[
        "population"
    ]
    .fillna(0)

)


# ============================================================
# STEP 10 — NORMALIZATION
# ============================================================

print(
    "Normalizing suitability factors..."
)


def normalize(values):

    values = np.asarray(
        values,
        dtype=float
    )


    values = np.nan_to_num(
        values,
        nan=0.0,
        posinf=0.0,
        neginf=0.0
    )


    minimum = values.min()
    maximum = values.max()


    if maximum == minimum:

        return np.full(
            len(values),
            50.0
        )


    return (

        (
            values - minimum
        )
        /
        (
            maximum - minimum
        )

    ) * 100


# ------------------------------------------------------------
# Road accessibility
# ------------------------------------------------------------

grid_metric[
    "road_accessibility"
] = (

    100 -
    normalize(
        grid_metric[
            "dist_to_road_m"
        ]
    )

)


# ------------------------------------------------------------
# Population need
# ------------------------------------------------------------

grid_metric[
    "population_need"
] = normalize(
    grid_metric[
        "nearby_population"
    ]
)


# ------------------------------------------------------------
# Public transport access
# ------------------------------------------------------------

grid_metric[
    "transit_access"
] = (

    100 -
    normalize(
        grid_metric[
            "dist_to_bus_m"
        ]
    )

)


# ------------------------------------------------------------
# Infrastructure need
# ------------------------------------------------------------

grid_metric[
    "infrastructure_need"
] = (

    normalize(
        grid_metric[
            "priority_score"
        ].fillna(0)
    )

)


# ------------------------------------------------------------
# Healthcare access gap
#
# A site farther from existing hospitals is more valuable
# for closing a healthcare accessibility gap.
# ------------------------------------------------------------

grid_metric[
    "healthcare_access_gap"
] = normalize(
    grid_metric[
        "dist_to_hospital_m"
    ]
)


# ============================================================
# STEP 11 — FINAL SUITABILITY SCORE
# ============================================================

print()
print(
    "Calculating final site suitability..."
)


# ------------------------------------------------------------
# MODEL
#
# 25% road accessibility
# 20% population need
# 15% public transport
# 15% ward infrastructure need
# 25% healthcare access gap
# ------------------------------------------------------------

grid_metric[
    "suitability_score"
] = (

    0.25 *
    grid_metric[
        "road_accessibility"
    ]

    +

    0.20 *
    grid_metric[
        "population_need"
    ]

    +

    0.15 *
    grid_metric[
        "transit_access"
    ]

    +

    0.15 *
    grid_metric[
        "infrastructure_need"
    ]

    +

    0.25 *
    grid_metric[
        "healthcare_access_gap"
    ]

)


grid_metric[
    "suitability_score"
] = (

    grid_metric[
        "suitability_score"
    ]
    .clip(0, 100)
    .round(2)

)


# ============================================================
# STEP 12 — EXPLAINABLE REASON
# ============================================================

print(
    "Generating explanations..."
)


def create_reason(row):

    reasons = []


    if row[
        "road_accessibility"
    ] >= 70:

        reasons.append(
            "high road accessibility"
        )


    if row[
        "population_need"
    ] >= 70:

        reasons.append(
            "high population need"
        )


    if row[
        "transit_access"
    ] >= 70:

        reasons.append(
            "good public transport access"
        )


    if row[
        "infrastructure_need"
    ] >= 70:

        reasons.append(
            "high infrastructure priority"
        )


    if row[
        "healthcare_access_gap"
    ] >= 70:

        reasons.append(
            "large healthcare access gap"
        )


    if not reasons:

        reasons.append(
            "moderate suitability across factors"
        )


    return "; ".join(
        reasons
    )


grid_metric[
    "explanation"
] = grid_metric.apply(
    create_reason,
    axis=1
)


# ============================================================
# STEP 13 — RANK CANDIDATES
# ============================================================

grid_metric = (

    grid_metric
    .sort_values(
        "suitability_score",
        ascending=False
    )
    .reset_index(
        drop=True
    )

)


grid_metric[
    "suitability_rank"
] = (

    grid_metric.index + 1

)


# ============================================================
# STEP 14 — SAVE
# ============================================================

print()
print(
    "Saving candidate site dataset..."
)


os.makedirs(
    "output",
    exist_ok=True
)


grid_output = (
    grid_metric
    .to_crs("EPSG:4326")
)


grid_output.to_file(
    OUTPUT_FILE,
    driver="GeoJSON"
)


# ============================================================
# RESULTS
# ============================================================

print()
print("==============================================")
print("URBANLENS STEP 5 COMPLETE")
print("==============================================")

print(
    f"Candidate sites: "
    f"{len(grid_output)}"
)

print(
    f"Output: "
    f"{OUTPUT_FILE}"
)

print("==============================================")

print()
print(
    "TOP 10 CANDIDATE SITES"
)

print()

print(

    grid_output[
        [
            "suitability_rank",
            "candidate_id",
            "Name",
            "priority_level",
            "suitability_score",
            "explanation"
        ]
    ]

    .head(10)

    .to_string(
        index=False
    )

)

print()
