import os
import geopandas as gpd

# ============================================================
# URBANLENS — STEP 4
# Ward Priority & Infrastructure Need Engine
#
# PURPOSE:
# Convert ward-level analytical indicators into a final
# explainable priority score and ranking.
# ============================================================

INPUT_FILE = "output/ahmedabad_wards_base.geojson"
OUTPUT_FILE = "output/ahmedabad_wards_priority.geojson"


print()
print("==============================================")
print("URBANLENS — STEP 4")
print("Ward Priority Engine")
print("==============================================")
print()


# ============================================================
# STEP 1 — LOAD DATA
# ============================================================

print("Loading ward dataset...")

wards = gpd.read_file(INPUT_FILE)

print(
    f"Loaded {len(wards)} wards."
)


# ============================================================
# STEP 2 — VALIDATE INPUT
# ============================================================

required_columns = [
    "Name",
    "population",
    "hospital_count",
    "school_count",
    "population_pressure",
    "hospital_deficit",
    "school_deficit",
    "hospital_access_gap",
    "infrastructure_need_score",
]

missing = [
    column
    for column in required_columns
    if column not in wards.columns
]

if missing:

    raise ValueError(
        "Missing required columns: "
        + ", ".join(missing)
    )


# ============================================================
# STEP 3 — CLEAN DATA
# ============================================================

numeric_columns = [
    "population",
    "hospital_count",
    "school_count",
    "population_pressure",
    "hospital_deficit",
    "school_deficit",
    "hospital_access_gap",
    "infrastructure_need_score",
]

for column in numeric_columns:

    wards[column] = (
        wards[column]
        .fillna(0)
    )


# ============================================================
# STEP 4 — FINAL PRIORITY SCORE
# ============================================================

print(
    "Calculating final ward priority..."
)


# The model prioritizes wards where:
#
# 35% → Population pressure
# 30% → Healthcare access gap
# 20% → Hospital deficit
# 15% → School deficit
#
# This makes healthcare accessibility the central
# decision factor while still accounting for broader
# infrastructure pressure.

wards["priority_score"] = (

    0.35 *
    wards["population_pressure"]

    +

    0.30 *
    wards["hospital_access_gap"]

    +

    0.20 *
    wards["hospital_deficit"]

    +

    0.15 *
    wards["school_deficit"]

)


wards["priority_score"] = (

    wards["priority_score"]
    .clip(0, 1)
    .round(4)

)


# ============================================================
# STEP 5 — PRIORITY LEVEL
# ============================================================

def priority_level(score):

    if score >= 0.75:
        return "CRITICAL"

    elif score >= 0.60:
        return "HIGH"

    elif score >= 0.40:
        return "MEDIUM"

    else:
        return "LOW"


wards["priority_level"] = (

    wards["priority_score"]
    .apply(priority_level)

)


# ============================================================
# STEP 6 — EXPLAINABLE REASON
# ============================================================

def generate_reason(row):

    reasons = []

    if row["population_pressure"] >= 0.70:

        reasons.append(
            "high population pressure"
        )

    if row["hospital_access_gap"] >= 0.70:

        reasons.append(
            "poor healthcare accessibility"
        )

    if row["hospital_deficit"] >= 0.70:

        reasons.append(
            "low hospital availability"
        )

    if row["school_deficit"] >= 0.70:

        reasons.append(
            "low school availability"
        )

    if not reasons:

        reasons.append(
            "moderate infrastructure pressure"
        )

    return ", ".join(reasons)


wards["priority_reason"] = (

    wards
    .apply(
        generate_reason,
        axis=1
    )

)


# ============================================================
# STEP 7 — RANK WARDS
# ============================================================

wards = (

    wards
    .sort_values(
        "priority_score",
        ascending=False
    )
    .reset_index(drop=True)

)


wards["priority_rank"] = (

    wards.index + 1

)


# ============================================================
# STEP 8 — SAVE
# ============================================================

print()
print(
    "Saving priority dataset..."
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
print("URBANLENS STEP 4 COMPLETE")
print("==============================================")

print(
    f"Wards analysed: {len(wards)}"
)

print(
    f"Output: {OUTPUT_FILE}"
)

print("==============================================")

print()
print("TOP 10 PRIORITY WARDS")
print()

print(

    wards[
        [
            "priority_rank",
            "Name",
            "population",
            "hospital_count",
            "nearest_hospital_dist_km",
            "priority_score",
            "priority_level",
            "priority_reason"
        ]
    ]

    .head(10)

    .to_string(
        index=False
    )

)

print()
