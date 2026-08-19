import geopandas as gpd
from pathlib import Path


# ============================================================
# UrbanLens — Step 1
# Geospatial Data Standardization
# ============================================================

PROJECT_ROOT = Path("/Users/anushkayerpuday/UrbanLens")

PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"


def standardize_vector(input_file, output_file):
    """
    Load a vector dataset, clean basic geometry issues,
    standardize CRS, and save the processed dataset.
    """

    print("\n" + "=" * 60)
    print("STANDARDIZING DATA")
    print("=" * 60)

    print(f"Input : {input_file}")
    print(f"Output: {output_file}")

    # --------------------------------------------------------
    # 1. Load dataset
    # --------------------------------------------------------

    gdf = gpd.read_file(input_file)

    print(f"\nLoaded {len(gdf)} features")

    # --------------------------------------------------------
    # 2. Remove missing geometries
    # --------------------------------------------------------

    before = len(gdf)

    gdf = gdf[gdf.geometry.notna()].copy()

    print(
        f"Removed {before - len(gdf)} features "
        "with missing geometry"
    )

    # --------------------------------------------------------
    # 3. Remove empty geometries
    # --------------------------------------------------------

    before = len(gdf)

    gdf = gdf[~gdf.geometry.is_empty].copy()

    print(
        f"Removed {before - len(gdf)} "
        "empty geometries"
    )

    # --------------------------------------------------------
    # 4. Fix invalid geometries
    # --------------------------------------------------------

    invalid_count = (~gdf.geometry.is_valid).sum()

    print(f"Invalid geometries found: {invalid_count}")

    if invalid_count > 0:
        gdf["geometry"] = gdf.geometry.make_valid()

        print("Invalid geometries repaired.")

    # --------------------------------------------------------
    # 5. Remove duplicate geometries
    # --------------------------------------------------------

    before = len(gdf)

    gdf = gdf[
        ~gdf.geometry.duplicated()
    ].copy()

    print(
        f"Removed {before - len(gdf)} "
        "duplicate geometries"
    )

    # --------------------------------------------------------
    # 6. Standardize CRS
    # --------------------------------------------------------

    TARGET_CRS = "EPSG:4326"

    if gdf.crs is None:

        print(
            "WARNING: Dataset has no CRS. "
            "Assuming EPSG:4326."
        )

        gdf = gdf.set_crs(TARGET_CRS)

    elif gdf.crs.to_string() != TARGET_CRS:

        print(
            f"Reprojecting from {gdf.crs} "
            f"to {TARGET_CRS}"
        )

        gdf = gdf.to_crs(TARGET_CRS)

    else:

        print(
            f"CRS already standardized: {TARGET_CRS}"
        )

    # --------------------------------------------------------
    # 7. Create output directory
    # --------------------------------------------------------

    output_file.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # 8. Save
    # --------------------------------------------------------

    gdf.to_file(
        output_file,
        driver="GeoJSON"
    )

    print(
        f"\nSaved {len(gdf)} features successfully."
    )

    print("=" * 60)


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":

    standardize_vector(
        PROJECT_ROOT / "data" / "ahmedabad_wards.geojson",
        PROCESSED_DIR / "boundaries" / "ahmedabad_wards.geojson"
    )

    standardize_vector(
        PROJECT_ROOT / "output" / "ahmedabad_hospitals.geojson",
        PROCESSED_DIR / "facilities" / "ahmedabad_hospitals.geojson"
    )

    standardize_vector(
        PROJECT_ROOT / "output" / "parcels_scored.geojson",
        PROCESSED_DIR / "parcels" / "ahmedabad_parcels.geojson"
    )

    print("\n")
    print("=" * 60)
    print("URBANLENS STEP 1 COMPLETE")
    print("=" * 60)