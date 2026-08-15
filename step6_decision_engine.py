import os
import geopandas as gpd

from simulation_engine import simulate_facility


# ============================================================
# URBANLENS — STEP 6
# Decision Engine
# ============================================================

PARCEL_FILE = "output/parcels_scored.geojson"
OUTPUT_FILE = "output/recommended_sites.geojson"

TOP_N = 10


print("""
==============================================
URBANLENS — STEP 6
Decision Engine
==============================================
""")


# ============================================================
# LOAD CANDIDATE SITES
# ============================================================

print("Loading candidate sites...")

parcels = gpd.read_file(PARCEL_FILE)

print(f"Loaded {len(parcels)} candidate sites.")


# ============================================================
# SELECT TOP CANDIDATES
# ============================================================

# We first take the best land-suitability candidates.
# Simulation is then used to determine their real impact.

top_sites = (
    parcels
    .sort_values(
        "suitability_score",
        ascending=False
    )
    .head(TOP_N)
    .copy()
)

print(
    f"Evaluating top {len(top_sites)} candidate sites..."
)


# ============================================================
# RUN SIMULATIONS
# ============================================================

results = []

for _, site in top_sites.iterrows():

    point = site.geometry.centroid

    lat = point.y
    lon = point.x

    print()
    print(
        f"Simulating {site.candidate_id}..."
    )

    simulation = simulate_facility(
        new_lat=lat,
        new_lon=lon,
        facility_type="hospital",
        radius_km=3
    )

    results.append({

        "candidate_id":
            site.candidate_id,

        "ward":
            site.Name,

        "latitude":
            lat,

        "longitude":
            lon,

        "suitability_score":
            float(site.suitability_score),

        "population_benefiting":
            simulation["population_benefiting"],

        "newly_covered_population":
            simulation["newly_covered_population"],

        "distance_improvement_km":
            simulation["distance_improvement_km"],

        "coverage_improvement_percent":
            simulation["coverage_improvement_percent"]
    })


# ============================================================
# CREATE RESULT DATASET
# ============================================================

results_gdf = gpd.GeoDataFrame(
    results,
    geometry=[
        site.geometry.centroid
        for _, site in top_sites.iterrows()
    ],
    crs=top_sites.crs
)


# ============================================================
# NORMALIZATION
# ============================================================

def normalize(series):

    minimum = series.min()
    maximum = series.max()

    if maximum == minimum:
        return series * 0 + 1

    return (
        (series - minimum) /
        (maximum - minimum)
    )


results_gdf["suitability_norm"] = normalize(
    results_gdf["suitability_score"]
)

results_gdf["population_benefit_norm"] = normalize(
    results_gdf["population_benefiting"]
)

results_gdf["coverage_norm"] = normalize(
    results_gdf["newly_covered_population"]
)

results_gdf["distance_norm"] = normalize(
    results_gdf["distance_improvement_km"]
)


# ============================================================
# FINAL DECISION SCORE
# ============================================================

# IMPACT-FIRST DECISION MODEL
#
# 40% = newly covered population
# 25% = distance improvement
# 20% = land suitability
# 15% = population benefiting
#
# This prevents a highly suitable parcel from automatically
# winning when it provides little or no additional access.

results_gdf["decision_score"] = (

    0.40 *
    results_gdf["coverage_norm"]

    +

    0.25 *
    results_gdf["distance_norm"]

    +

    0.20 *
    results_gdf["suitability_norm"]

    +

    0.15 *
    results_gdf["population_benefit_norm"]
)


results_gdf["decision_score"] = (
    results_gdf["decision_score"] * 100
).round(2)


# ============================================================
# RANK
# ============================================================

results_gdf = (
    results_gdf
    .sort_values(
        "decision_score",
        ascending=False
    )
    .reset_index(drop=True)
)

results_gdf["decision_rank"] = (
    results_gdf.index + 1
)


# ============================================================
# RECOMMENDATION
# ============================================================

results_gdf["recommendation"] = "Alternative"

results_gdf.loc[
    results_gdf.index == 0,
    "recommendation"
] = "RECOMMENDED"


# ============================================================
# SAVE
# ============================================================

os.makedirs(
    "output",
    exist_ok=True
)

results_gdf.to_file(
    OUTPUT_FILE,
    driver="GeoJSON"
)


# ============================================================
# DISPLAY
# ============================================================

best = results_gdf.iloc[0]

print()
print("""
==============================================
URBANLENS DECISION ENGINE COMPLETE
==============================================
""")

print(
    f"Sites evaluated: {len(results_gdf)}"
)

print(
    f"Output: {OUTPUT_FILE}"
)

print()
print("RECOMMENDED SITE")
print("----------------------------------------------")

print(
    f"Candidate: {best.candidate_id}"
)

print(
    f"Ward: {best.ward}"
)

print(
    f"Suitability: "
    f"{best.suitability_score:.2f}"
)

print(
    f"Population benefiting: "
    f"{int(best.population_benefiting):,}"
)

print(
    f"Newly covered population: "
    f"{int(best.newly_covered_population):,}"
)

print(
    f"Distance improvement: "
    f"{best.distance_improvement_km:.2f} km"
)

print(
    f"Coverage improvement: "
    f"{best.coverage_improvement_percent:.2f}%"
)

print(
    f"FINAL DECISION SCORE: "
    f"{best.decision_score:.2f}"
)

print("----------------------------------------------")

print()
print("TOP 10 SITES")
print()

print(
    results_gdf[
        [
            "decision_rank",
            "candidate_id",
            "ward",
            "suitability_score",
            "population_benefiting",
            "newly_covered_population",
            "decision_score"
        ]
    ].to_string(index=False)
)

print()
