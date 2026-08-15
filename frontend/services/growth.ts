import type { LandUse, Year } from "@/types";
import { computeTransitions, growthSummary, explainGrowth } from "@/lib/analysis";
import { simulateLatency } from "./latency";

/**
 * Urban growth service.
 * Backend swap: GET /api/growth/history · GET /api/growth/prediction
 */

export async function fetchGrowthSummary(): Promise<{
  builtUpKm2: Record<Year, number>;
  growthPct: number;
}> {
  await simulateLatency(100);
  return growthSummary();
}

export async function fetchTransitions(
  from: Year,
  to: Year
): Promise<{ from: LandUse; to: LandUse; areaHa: number }[]> {
  await simulateLatency(80);
  return computeTransitions(from, to);
}

export async function fetchGrowthExplanation(wardId: string): Promise<string[]> {
  await simulateLatency(60);
  return explainGrowth(wardId);
}
