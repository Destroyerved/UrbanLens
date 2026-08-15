import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { cityIdFrom, json } from "@/lib/engine/api";
import { getPopulationGrid } from "@/lib/engine/gis/population";

export async function GET(req: NextRequest) {
  const t = Date.now();
  const ds = getDataset(cityIdFrom(req));
  const byType: Record<string, number> = {};
  for (const f of ds.facilities.features) {
    const k = f.properties.facility_type;
    byType[k] = (byType[k] ?? 0) + 1;
  }
  const grid = getPopulationGrid(ds);
  return json({
    ok: true,
    city: ds.cityId,
    sources: ds.sources,
    generatedAt: ds.generatedAt,
    counts: {
      wards: ds.wards.features.length,
      parcels: ds.parcels.features.length,
      facilities: ds.facilities.features.length,
      roads: ds.roads.features.length,
      prediction_cells: ds.prediction.features.length,
      population_cells: grid.cellCount,
    },
    population_total: Math.round(grid.total),
    facilities_by_type: byType,
    took_ms: Date.now() - t,
  });
}
