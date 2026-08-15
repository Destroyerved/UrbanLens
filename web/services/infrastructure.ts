import type { AccessibilityReport, LngLat, WardGap } from "@/types";
import {
  computeAccessibility,
  computeWardGaps,
  calculateLivability,
  computeCityKpis,
} from "@/lib/analysis";
import { simulateLatency } from "./latency";

/**
 * Infrastructure / accessibility service.
 * Backend swap: GET /api/infrastructure/gaps · POST /api/accessibility/analyze
 * · GET /api/livability
 */

let gapsCache: WardGap[] | null = null;

export async function fetchWardGaps(): Promise<WardGap[]> {
  await simulateLatency(160);
  if (!gapsCache) gapsCache = computeWardGaps();
  return gapsCache;
}

export async function analyzeAccessibility(point: LngLat): Promise<AccessibilityReport> {
  await simulateLatency(120);
  return computeAccessibility(point);
}

export async function fetchLivability(wardId: string) {
  await simulateLatency(100);
  if (!gapsCache) gapsCache = computeWardGaps();
  return calculateLivability(wardId, gapsCache);
}

export async function fetchCityKpis() {
  await simulateLatency(140);
  return computeCityKpis();
}
