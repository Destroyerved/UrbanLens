import json
import geopandas as gpd
from pathlib import Path

# ============================================================
# URBANLENS — STEP 7
# Final Decision Summary Generator
# ============================================================

INPUT_FILE = "output/recommended_sites.geojson"
OUTPUT_FILE = "output/urbanlens_summary.json"

print("""
==============================================
URBANLENS — STEP 7
Final Decision Summary
==============================================
""")

# ------------------------------------------------------------
# LOAD RECOMMENDED SITES
# ------------------------------------------------------------

print("Loading recommended sites...")

sites = gpd.read_file(INPUT_FILE)

print(f"Loaded {len(sites)} recommended sites.")

if len(sites) == 0:
    raise ValueError("No recommended sites found.")


# ------------------------------------------------------------
# SORT BY DECISION RANK
# ------------------------------------------------------------

if "decision_rank" in sites.columns:
    sites = sites.sort_values("decision_rank")


# ------------------------------------------------------------
# HELPER
# ------------------------------------------------------------

def clean_value(value):

    if hasattr(value, "item"):
        value = value.item()

    if isinstance(value, float):
        return round(value, 4)

    return value


# ------------------------------------------------------------
# BUILD SITE RECORDS
# ------------------------------------------------------------

site_records = []

for _, row in sites.iterrows():

    geometry = row.geometry

    latitude = None
    longitude = None

    if geometry is not None:
        point = geometry.centroid
        latitude = round(point.y, 6)
        longitude = round(point.x, 6)

    record = {
        "rank": clean_value(
            row.get("decision_rank")
        ),

        "parcel_id": clean_value(
            row.get("parcel_id")
        ),

        "ward": clean_value(
            row.get("ward", row.get("Name"))
        ),

        "latitude": latitude,

        "longitude": longitude,

        "suitability_score": clean_value(
            row.get("suitability_score")
        ),

        "decision_score": clean_value(
            row.get("decision_score")
        ),

        "population_benefiting": clean_value(
            row.get("population_benefiting", 0)
        ),

        "newly_covered_population": clean_value(
            row.get("newly_covered_population", 0)
        ),

        "distance_improvement_km": clean_value(
            row.get("distance_improvement_km", 0)
        ),

        "coverage_improvement_percent": clean_value(
            row.get("coverage_improvement_percent", 0)
        )
    }

    site_records.append(record)


# ------------------------------------------------------------
# BEST SITE
# ------------------------------------------------------------

best = site_records[0]


# ------------------------------------------------------------
# GENERATE EXPLANATION
# ------------------------------------------------------------

if best["newly_covered_population"] > 0:

    recommendation_reason = (
        f"Selected as the highest-ranked site because it provides "
        f"strong land suitability while extending healthcare access "
        f"to approximately "
        f"{best['newly_covered_population']:,} additional residents."
    )

else:

    recommendation_reason = (
        "Selected as the highest-ranked site based on the combined "
        "land suitability, population need and infrastructure "
        "priority score. However, the simulation indicates that "
        "the site does not add new population coverage within the "
        "current coverage radius."
    )


# ------------------------------------------------------------
# FINAL SUMMARY
# ------------------------------------------------------------

summary = {

    "project": "UrbanLens",

    "city": "Ahmedabad",

    "analysis": {

        "wards_analyzed": 48,

        "candidate_sites_evaluated": len(sites),

        "analysis_type":
            "Geospatial infrastructure planning"

    },

    "recommended_site": {

        **best,

        "reason": recommendation_reason

    },

    "alternatives": site_records[1:],

    "methodology": {

        "population_source":
            "WorldPop population raster",

        "infrastructure_source":
            "OpenStreetMap",

        "decision_factors": [

            "Population need",

            "Existing hospital availability",

            "Land suitability",

            "Accessibility",

            "Public transport access",

            "Infrastructure need",

            "Simulated healthcare coverage"

        ]

    }

}


# ------------------------------------------------------------
# SAVE
# ------------------------------------------------------------

Path("output").mkdir(exist_ok=True)

with open(
    OUTPUT_FILE,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        summary,
        f,
        indent=2,
        ensure_ascii=False
    )


# ------------------------------------------------------------
# PRINT RESULT
# ------------------------------------------------------------

print()
print("==============================================")
print("URBANLENS STEP 7 COMPLETE")
print("==============================================")

print(f"Output: {OUTPUT_FILE}")

print()
print("RECOMMENDED SITE")
print("----------------------------------------------")

print(
    f"Parcel: {best['parcel_id']}"
)

print(
    f"Ward: {best['ward']}"
)

print(
    f"Location: "
    f"{best['latitude']}, "
    f"{best['longitude']}"
)

print(
    f"Suitability: "
    f"{best['suitability_score']}"
)

print(
    f"Decision score: "
    f"{best['decision_score']}"
)

print(
    f"Population benefiting: "
    f"{best['population_benefiting']:,}"
)

print(
    f"Newly covered population: "
    f"{best['newly_covered_population']:,}"
)

print()
print("Reason:")
print(recommendation_reason)

print("----------------------------------------------")
