import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { livability, LIVABILITY_WEIGHTS, coverageReport } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

/**
 * Urban Livability Score per ward (PRD §15). The component weights are returned
 * with the results so the blend is auditable rather than a black box, along with
 * the source-data coverage caveats that apply to its inputs.
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const wards = livability(ds);
  const population = wards.reduce((s, w) => s + w.population, 0);
  // Population-weighted city average — a small ward should not swing the city
  // figure as much as a large one.
  const cityScore = population
    ? Math.round(wards.reduce((s, w) => s + w.score * w.population, 0) / population)
    : 0;

  return json({
    city_score: cityScore,
    weights: LIVABILITY_WEIGHTS,
    coverage: coverageReport(ds),
    wards,
  });
}
