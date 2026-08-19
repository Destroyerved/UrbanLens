import geopandas as gpd
from pathlib import Path


# ============================================================
# UrbanLens — Step 2.4
# Assign Grid Cells to Ahmedabad Wards
# Using Maximum Spatial Overlap
# ============================================================

PROJECT_ROOT = Path("/Users/anushkayerpuday/UrbanLens")

GRID_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "grids"
    / "ahmedabad_grid_250m.geojson"
)

WARD_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "boundaries"
    / "ahmedabad_wards.geojson"
)

OUTPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "grids"
    / "ahmedabad_grid_250m_wards.geojson"
)

METRIC_CRS = "EPSG:32643"
OUTPUT_CRS = "EPSG:4326"


# ============================================================
# 1. Load data
# ============================================================

print("\n" + "=" * 60)
print("URBANLENS — ASSIGN GRID CELLS TO WARDS")
print("METHOD: MAXIMUM SPATIAL OVERLAP")
print("=" * 60)

print("\nLoading grid...")

grid = gpd.read_file(GRID_FILE)

print("Grid cells:", len(grid))
print("Grid CRS:", grid.crs)

print("\nLoading wards...")

wards = gpd.read_file(WARD_FILE)

print("Wards:", len(wards))
print("Ward CRS:", wards.crs)


# ============================================================
# 2. Convert both datasets to metric CRS
# ============================================================

print("\nConverting data to metric CRS...")

grid_metric = grid.to_crs(METRIC_CRS)
wards_metric = wards.to_crs(METRIC_CRS)

print("Metric CRS:", METRIC_CRS)


# ============================================================
# 3. Calculate intersections
# ============================================================

print("\nFinding grid/ward overlaps...")

intersections = gpd.overlay(
    grid_metric[["grid_id", "geometry"]],
    wards_metric[["Name", "geometry"]],
    how="intersection"
)

print(
    "Grid/ward intersection records:",
    len(intersections)
)


# ============================================================
# 4. Calculate overlap area
# ============================================================

print("\nCalculating overlap areas...")

intersections["overlap_area_m2"] = (
    intersections.geometry.area
)


# ============================================================
# 5. Find the ward with maximum overlap
#    for each grid cell
# ============================================================

print("\nSelecting ward with maximum overlap...")

best_matches = (
    intersections
    .sort_values(
        ["grid_id", "overlap_area_m2"],
        ascending=[True, False]
    )
    .drop_duplicates(
        subset="grid_id",
        keep="first"
    )
)

best_matches = best_matches[
    ["grid_id", "Name", "overlap_area_m2"]
].copy()


# ============================================================
# 6. Calculate percentage of grid covered by ward
# ============================================================

CELL_AREA = 250 * 250

best_matches["ward_overlap_percent"] = (
    best_matches["overlap_area_m2"]
    / CELL_AREA
    * 100
)


# ============================================================
# 7. Attach ward information to original grid
# ============================================================

print("\nAttaching ward information...")

grid = grid.merge(
    best_matches[
        [
            "grid_id",
            "Name",
            "overlap_area_m2",
            "ward_overlap_percent"
        ]
    ],
    on="grid_id",
    how="left"
)


# ============================================================
# 8. Rename fields
# ============================================================

grid = grid.rename(
    columns={
        "Name": "ward_name"
    }
)


# ============================================================
# 9. Convert back to geographic CRS
# ============================================================

grid = grid.to_crs(OUTPUT_CRS)


# ============================================================
# 10. Save
# ============================================================

OUTPUT_FILE.parent.mkdir(
    parents=True,
    exist_ok=True
)

grid.to_file(
    OUTPUT_FILE,
    driver="GeoJSON"
)


# ============================================================
# 11. Validation
# ============================================================

print("\n" + "=" * 60)
print("GRID-WARD ASSIGNMENT COMPLETE")
print("=" * 60)

print("Original grid cells:", len(grid))

print(
    "Unique wards:",
    grid["ward_name"].nunique()
)

print(
    "Unassigned cells:",
    grid["ward_name"].isna().sum()
)

print(
    "Duplicate grid IDs:",
    grid["grid_id"].duplicated().sum()
)

print(
    "Invalid geometries:",
    (~grid.geometry.is_valid).sum()
)

print(
    "Minimum ward overlap (%):",
    grid["ward_overlap_percent"].min()
)

print(
    "Maximum ward overlap (%):",
    grid["ward_overlap_percent"].max()
)

print("\nExample:")

print(
    grid[
        [
            "grid_id",
            "ward_name",
            "ward_overlap_percent"
        ]
    ]
    .head(10)
    .to_string(index=False)
)

print("\nOutput:")
print(OUTPUT_FILE)

print("=" * 60)