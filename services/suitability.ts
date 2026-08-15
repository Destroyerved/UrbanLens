import type {
  ProjectType,
  SiteCandidate,
  SiteConstraints,
  SuitabilityResult,
  SuitabilityWeights,
} from "@/types";
import { computeSuitability, searchSites } from "@/lib/analysis";
import { PARCEL_BY_ID } from "@/data/parcels";
import { simulateLatency } from "./latency";

/**
 * Suitability service.
 * Backend swap: POST /api/suitability/calculate · POST /api/suitability/search
 */

export async function calculateSuitability(
  parcelId: string,
  projectType: ProjectType,
  weights: SuitabilityWeights
): Promise<SuitabilityResult | null> {
  await simulateLatency(90);
  const parcel = PARCEL_BY_ID.get(parcelId);
  return parcel ? computeSuitability(parcel, projectType, weights) : null;
}

export async function runSiteSearch(
  projectType: ProjectType,
  constraints: SiteConstraints,
  weights: SuitabilityWeights,
  opts?: { latency?: number }
): Promise<SiteCandidate[]> {
  await simulateLatency(opts?.latency ?? 900);
  return searchSites(projectType, constraints, weights);
}

/** Synchronous re-rank for live weight sliders (no artificial latency). */
export function reRankSites(
  projectType: ProjectType,
  constraints: SiteConstraints,
  weights: SuitabilityWeights
): SiteCandidate[] {
  return searchSites(projectType, constraints, weights);
}
