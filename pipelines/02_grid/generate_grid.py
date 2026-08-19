import geopandas as gpd
from shapely.geometry import box
from pathlib import Path


# ============================================================
# UrbanLens — Step 2
# Spatial Grid Generation
# ============================================================

PROJECT_ROOT = Path("/Users/anushkayerpuday/UrbanLens")

BOUNDARY_FILE = (
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
    / "ahmedabad_grid_250m.geojson"
)

# CRS used for distance/area calculations
METRIC_CRS = "EPSG:32643"

# CRS used for storing/displaying geographic data
OUTPUT_CRS = "EPSG:4326"

# Grid cell size in metres
CELL_SIZE = 250


# ============================================================
# 1. Load Ahmedabad boundary
# ============================================================

print("\n" + "=" * 60)
print("URBANLENS — SPATIAL GRID GENERATION")
print("=" * 60)

print("\nLoading Ahmedabad boundary...")

wards = gpd.read_file(BOUNDARY_FILE)

print("Wards loaded:", len(wards))
print("Original CRS:", wards.crs)


# ============================================================
# 2. Convert to metric CRS
# ============================================================

print("\nConverting boundary to metric CRS...")

wards_metric = wards.to_crs(METRIC_CRS)

print("Metric CRS:", wards_metric.crs)


# ============================================================
# 3. Combine all wards into one Ahmedabad boundary
# ============================================================

print("\nCreating city boundary...")

city_boundary = wards_metric.geometry.union_all()

min_x, min_y, max_x, max_y = city_boundary.bounds

print("Boundary bounds:")
print("Min X:", min_x)
print("Min Y:", min_y)
print("Max X:", max_x)
print("Max Y:", max_y)


# ============================================================
# 4. Generate grid cells
# ============================================================

print("\nGenerating 250m × 250m grid...")

cells = []

grid_id = 1

x = min_x

while x < max_x:

    y = min_y

    while y < max_y:

        cell = box(
            x,
            y,
            x + CELL_SIZE,
            y + CELL_SIZE
        )

        # Keep cells that intersect Ahmedabad
        if cell.intersects(city_boundary):

            cells.append(
                {
                    "grid_id": f"GRID_{grid_id:05d}",
                    "geometry": cell
                }
            )

            grid_id += 1

        y += CELL_SIZE

    x += CELL_SIZE


print("Grid cells generated:", len(cells))


# ============================================================
# 5. Convert to GeoDataFrame
# ============================================================

grid = gpd.GeoDataFrame(
    cells,
    crs=METRIC_CRS
)


# ============================================================
# 6. Add basic grid attributes
# ============================================================

grid["cell_size_m"] = CELL_SIZE

grid["area_m2"] = grid.geometry.area

grid["area_km2"] = (
    grid["area_m2"] / 1_000_000
)


# ============================================================
# 7. Convert to geographic CRS
# ============================================================

print("\nConverting grid to EPSG:4326...")

grid = grid.to_crs(OUTPUT_CRS)


# ============================================================
# 8. Save
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
# 9. Summary
# ============================================================

print("\n" + "=" * 60)
print("GRID GENERATION COMPLETE")
print("=" * 60)

print("Total grid cells:", len(grid))
print("Grid size:", f"{CELL_SIZE}m × {CELL_SIZE}m")
print("CRS:", grid.crs)
print("Output:", OUTPUT_FILE)

print("=" * 60)