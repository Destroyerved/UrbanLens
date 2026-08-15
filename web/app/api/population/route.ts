import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { getPopulationGrid, populationCells } from "@/lib/engine/gis/population";
import { cityIdFrom, json } from "@/lib/engine/api";

/**
 * The population raster as GeoJSON points, one per populated cell, for the
 * density heatmap (PRD §7 layer list, §68 priority 5).
 *
 * `step` samples every Nth cell in each direction — density per cell is
 * unchanged, the sample is just coarser. Default 1 (every cell).
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const grid = getPopulationGrid(ds);
  const step = Math.max(1, Math.min(8, Number(req.nextUrl.searchParams.get("step") ?? 1) || 1));
  const cells = populationCells(ds, step);

  let maxDensity = 0;
  for (const c of cells) if (c.density > maxDensity) maxDensity = c.density;

  return json({
    type: "FeatureCollection",
    // Carried on the collection so the map can scale the heatmap ramp to the
    // city rather than to a hard-coded density.
    properties: {
      cell_size_m: 250,
      cells: cells.length,
      max_density: maxDensity,
      total_population: Math.round(grid.total),
      source: "derived",
    },
    features: cells.map((c, i) => ({
      type: "Feature",
      id: i,
      properties: { density: c.density, population: c.population },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  });
}
