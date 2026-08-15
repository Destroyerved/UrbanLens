import geopandas as gpd
import numpy as np
from shapely.geometry import Point


# ============================================================
# URBANLENS — SIMULATION ENGINE
# ============================================================

WARD_FILE = "output/ahmedabad_wards_base.geojson"
HOSPITAL_FILE = "output/ahmedabad_hospitals.geojson"
PARCEL_FILE = "output/parcels_scored.geojson"


# ============================================================
# SIMULATION FUNCTION
# ============================================================

def simulate_facility(
    new_lat,
    new_lon,
    facility_type="hospital",
    radius_km=3
):
    """
    Simulate placing a new facility at a proposed location.

    Uses:
    - Ahmedabad ward population
    - Real existing hospital locations from OpenStreetMap
    - Distance from ward centroids to hospitals
    - Proposed facility coverage radius

    Returns before/after accessibility statistics.
    """

    print("Loading Ahmedabad ward data...")
    wards = gpd.read_file(WARD_FILE)

    print("Loading existing hospital locations...")
    hospitals = gpd.read_file(HOSPITAL_FILE)

    # --------------------------------------------------------
    # Coordinate systems
    # --------------------------------------------------------

    wards = wards.to_crs("EPSG:4326")
    hospitals = hospitals.to_crs("EPSG:4326")

    # Metric CRS for accurate distance calculations
    wards_metric = wards.to_crs("EPSG:32643")
    hospitals_metric = hospitals.to_crs("EPSG:32643")

    # Proposed facility
    new_point = gpd.GeoSeries(
        [Point(new_lon, new_lat)],
        crs="EPSG:4326"
    ).to_crs("EPSG:32643").iloc[0]

    # --------------------------------------------------------
    # Ward centroids
    # --------------------------------------------------------

    ward_centroids = wards_metric.geometry.centroid

    # --------------------------------------------------------
    # Distance from every ward to existing hospitals
    # --------------------------------------------------------

    print("Calculating distances to existing hospitals...")

    existing_distances = []

    for centroid in ward_centroids:

        distances = hospitals_metric.geometry.distance(
            centroid
        )

        if len(distances) > 0:
            nearest_distance_km = distances.min() / 1000
        else:
            nearest_distance_km = 999

        existing_distances.append(nearest_distance_km)

    wards_metric["current_distance_km"] = existing_distances

    # --------------------------------------------------------
    # Distance from every ward to proposed facility
    # --------------------------------------------------------

    wards_metric["new_distance_km"] = (
        ward_centroids.distance(new_point) / 1000
    )

    # --------------------------------------------------------
    # Population
    # --------------------------------------------------------

    wards_metric["population"] = (
        wards_metric["population"]
        .fillna(0)
    )

    total_population = wards_metric["population"].sum()

    # --------------------------------------------------------
    # BEFORE
    # --------------------------------------------------------

    before_avg_distance = np.average(
        wards_metric["current_distance_km"],
        weights=wards_metric["population"]
    )

    before_covered_mask = (
        wards_metric["current_distance_km"] <= radius_km
    )

    before_covered_population = (
        wards_metric.loc[
            before_covered_mask,
            "population"
        ].sum()
    )

    # --------------------------------------------------------
    # AFTER
    # --------------------------------------------------------

    # The new facility can improve accessibility if
    # it is closer than the existing nearest hospital.

    wards_metric["after_distance_km"] = np.minimum(
        wards_metric["current_distance_km"],
        wards_metric["new_distance_km"]
    )

    after_avg_distance = np.average(
        wards_metric["after_distance_km"],
        weights=wards_metric["population"]
    )

    # Population within the new facility's coverage radius
    new_facility_coverage = (
        wards_metric["new_distance_km"] <= radius_km
    )

    # People who were NOT covered before but ARE covered now
    newly_covered_mask = (
        new_facility_coverage
        & (
            wards_metric["current_distance_km"]
            > radius_km
        )
    )

    newly_covered_population = (
        wards_metric.loc[
            newly_covered_mask,
            "population"
        ].sum()
    )

    # Population benefiting from improved distance,
    # even if they were already covered.
    benefiting_mask = (
        wards_metric["new_distance_km"]
        < wards_metric["current_distance_km"]
    )

    benefiting_population = (
        wards_metric.loc[
            benefiting_mask,
            "population"
        ].sum()
    )

    # --------------------------------------------------------
    # COVERAGE
    # --------------------------------------------------------

    coverage_before_pct = (
        before_covered_population /
        total_population *
        100
        if total_population > 0
        else 0
    )

    after_covered_mask = (
        wards_metric["after_distance_km"]
        <= radius_km
    )

    after_covered_population = (
        wards_metric.loc[
            after_covered_mask,
            "population"
        ].sum()
    )

    coverage_after_pct = (
        after_covered_population /
        total_population *
        100
        if total_population > 0
        else 0
    )

    coverage_improvement_pct = (
        coverage_after_pct -
        coverage_before_pct
    )

    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    return {
        "facility_type": facility_type,

        "latitude": round(new_lat, 6),

        "longitude": round(new_lon, 6),

        "coverage_radius_km": radius_km,

        "total_population": int(total_population),

        "before_avg_distance_km": round(
            before_avg_distance,
            2
        ),

        "after_avg_distance_km": round(
            after_avg_distance,
            2
        ),

        "distance_improvement_km": round(
            before_avg_distance -
            after_avg_distance,
            2
        ),

        "population_benefiting": int(
            benefiting_population
        ),

        "currently_covered_population": int(
            before_covered_population
        ),

        "newly_covered_population": int(
            newly_covered_population
        ),

        "coverage_before_percent": round(
            coverage_before_pct,
            2
        ),

        "coverage_after_percent": round(
            coverage_after_pct,
            2
        ),

        "coverage_improvement_percent": round(
            coverage_improvement_pct,
            2
        )
    }


# ============================================================
# AUTOMATIC TOP-SITE TEST
# ============================================================

if __name__ == "__main__":

    print("""
==============================================
URBANLENS — SIMULATION ENGINE
==============================================
""")

    # --------------------------------------------------------
    # Load candidate parcels generated by Step 5
    # --------------------------------------------------------

    print("Loading candidate sites...")

    parcels = gpd.read_file(PARCEL_FILE)

    print(
        f"Loaded {len(parcels)} candidate parcels."
    )

    # --------------------------------------------------------
    # Select highest suitability parcel
    # --------------------------------------------------------

    best_site = (
        parcels
        .sort_values(
            "suitability_score",
            ascending=False
        )
        .iloc[0]
    )

    # Extract coordinates from geometry
    best_point = best_site.geometry.centroid

    test_lat = best_point.y
    test_lon = best_point.x

    print()
    print("SELECTED BEST SITE")
    print("----------------------------------------------")
    print(f"Parcel: {best_site.parcel_id}")
    print(f"Ward: {best_site.Name}")
    print(
        f"Suitability score: "
        f"{best_site.suitability_score:.2f}"
    )
    print(
        f"Latitude: {test_lat:.6f}"
    )
    print(
        f"Longitude: {test_lon:.6f}"
    )
    print("----------------------------------------------")

    # --------------------------------------------------------
    # Run simulation
    # --------------------------------------------------------

    result = simulate_facility(
        new_lat=test_lat,
        new_lon=test_lon,
        facility_type="hospital",
        radius_km=3
    )

    # --------------------------------------------------------
    # Display result
    # --------------------------------------------------------

    print()
    print("SIMULATION RESULT")
    print("----------------------------------------------")

    for key, value in result.items():
        print(f"{key}: {value}")

    print("----------------------------------------------")
