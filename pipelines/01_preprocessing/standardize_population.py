import rasterio
from pathlib import Path


# ============================================================
# UrbanLens — Step 1
# Population Raster Standardization
# ============================================================

PROJECT_ROOT = Path("/Users/anushkayerpuday/UrbanLens")

INPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "ind_ppp_2020.tif"
)

OUTPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "population"
    / "ahmedabad_population_2020.tif"
)

TARGET_CRS = "EPSG:4326"


# ============================================================
# Main
# ============================================================

print("\n" + "=" * 60)
print("URBANLENS — POPULATION RASTER STANDARDIZATION")
print("=" * 60)

print("\nInput:")
print(INPUT_FILE)

print("\nOutput:")
print(OUTPUT_FILE)


# ------------------------------------------------------------
# 1. Open original raster
# ------------------------------------------------------------

with rasterio.open(INPUT_FILE) as src:

    print("\nOriginal raster information:")
    print("CRS:", src.crs)
    print("Width:", src.width)
    print("Height:", src.height)
    print("Bands:", src.count)
    print("Resolution:", src.res)
    print("Data type:", src.dtypes[0])

    # --------------------------------------------------------
    # 2. Check CRS
    # --------------------------------------------------------

    if src.crs is None:
        raise ValueError(
            "Population raster has no CRS."
        )

    if src.crs.to_string() != TARGET_CRS:
        raise ValueError(
            f"Expected {TARGET_CRS}, "
            f"but found {src.crs}"
        )

    print("\nCRS check: PASSED")

    # --------------------------------------------------------
    # 3. Create output directory
    # --------------------------------------------------------

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # 4. Copy raster
    # --------------------------------------------------------

    profile = src.profile.copy()

    profile.update(
        driver="GTiff",
        crs=TARGET_CRS
    )

    with rasterio.open(
        OUTPUT_FILE,
        "w",
        **profile
    ) as dst:

        for band in range(1, src.count + 1):
            dst.write(
                src.read(band),
                band
            )


# ============================================================
# Finished
# ============================================================

print("\nPopulation raster standardized successfully.")

print("\nOutput created:")
print(OUTPUT_FILE)

print("\n" + "=" * 60)
print("POPULATION STANDARDIZATION COMPLETE")
print("=" * 60)