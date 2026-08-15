import type {
  FactorScore,
  ProjectType,
  SiteCandidate,
  SiteConstraints,
  SuitabilityResult,
  SuitabilityWeights,
} from "@/types";
import { apiPost } from "@/lib/api";
import { PARCEL_BY_ID } from "@/data/parcels";

/**
 * Suitability — scored by the Python engine (PRD §16–20).
 *
 * On live weight sliders: the engine returns each candidate's six factor
 * scores, and `reRankSites` re-blends those with the user's weights on the
 * client. That is not a second implementation of the analysis — every factor
 * comes from the engine, and only the weighting, which is the user's own input,
 * is applied here. It keeps §19's live re-ranking instant instead of firing a
 * request per slider tick.
 */

interface ApiSuitability {
  parcel_id: string;
  final: number;
  pop: number;
  unserved: number;
  breakdown: Record<string, number>;
  metrics: { road_km: number; flood_risk: string; ownership: string; area_acres: number };
  explanation: { pros: string[]; cons: string[] };
  centroid: [number, number];
}

/** Engine factor name → UI weight key + label. */
const FACTOR: Record<string, { key: keyof SuitabilityWeights; label: string }> = {
  accessibility: { key: "accessibility", label: "Accessibility" },
  population_need: { key: "populationNeed", label: "Population Need" },
  transit: { key: "transit", label: "Transit" },
  infrastructure: { key: "infrastructure", label: "Infrastructure" },
  environment: { key: "environment", label: "Environment" },
  land_compatibility: { key: "landCompatibility", label: "Land Compatibility" },
};

const DETAIL: Record<string, (r: ApiSuitability) => string> = {
  population_need: (r) => `${r.unserved.toLocaleString("en-IN")} residents not already served`,
  accessibility: (r) => `${r.metrics.road_km.toFixed(1)} km to an arterial road`,
  land_compatibility: (r) => `${r.metrics.area_acres} acres · ${r.metrics.ownership}`,
  environment: (r) => `${r.metrics.flood_risk} flood risk`,
};

function toFactors(r: ApiSuitability, weights: SuitabilityWeights): FactorScore[] {
  return Object.entries(r.breakdown)
    .filter(([k]) => FACTOR[k])
    .map(([k, score]) => ({
      key: FACTOR[k].key,
      label: FACTOR[k].label,
      score: Math.round(score),
      weight: weights[FACTOR[k].key] ?? 0,
      detail: DETAIL[k]?.(r) ?? "",
    }));
}

function toResult(r: ApiSuitability, weights: SuitabilityWeights): SuitabilityResult {
  return {
    parcelId: r.parcel_id,
    score: r.final,
    factors: toFactors(r, weights),
    strengths: r.explanation.pros,
    concerns: r.explanation.cons,
  };
}

/** Re-blend engine factors with new weights, normalised by total weight. */
function blend(factors: FactorScore[], weights: SuitabilityWeights): number {
  let acc = 0;
  let total = 0;
  for (const f of factors) {
    const w = weights[f.key] ?? 0;
    acc += f.score * w;
    total += w;
  }
  return total > 0 ? Math.round(acc / total) : 0;
}

function body(projectType: ProjectType, c: SiteConstraints, limit: number) {
  return {
    project_type: projectType,
    minimum_area_hectares: c.minAreaHa,
    government_land: Boolean(c.governmentOnly),
    low_flood_risk: Boolean(c.lowFloodOnly || c.excludeFloodHazard),
    max_road_distance_km: c.maxRoadDistKm,
    limit,
  };
}

export async function calculateSuitability(
  parcelId: string,
  projectType: ProjectType,
  weights: SuitabilityWeights,
): Promise<SuitabilityResult | null> {
  try {
    const r = await apiPost<ApiSuitability>("/api/suitability/calculate", {
      parcel_id: parcelId,
      project_type: projectType,
    });
    return toResult(r, weights);
  } catch {
    return null;
  }
}

/** Candidates from the last search, so slider re-ranking needs no request. */
let lastCandidates: SiteCandidate[] = [];

export async function runSiteSearch(
  projectType: ProjectType,
  constraints: SiteConstraints,
  weights: SuitabilityWeights,
): Promise<SiteCandidate[]> {
  const res = await apiPost<{ results: ApiSuitability[] }>(
    "/api/suitability/search",
    body(projectType, constraints, 12),
  );
  lastCandidates = res.results
    .map((r, i) => {
      const parcel = PARCEL_BY_ID.get(r.parcel_id);
      if (!parcel) return null;
      return { ...toResult(r, weights), rank: i + 1, parcel };
    })
    .filter((c): c is SiteCandidate => c !== null);
  return lastCandidates;
}

/**
 * Synchronous re-rank for live weight sliders. Re-blends factor scores the
 * engine already returned; nothing is recomputed here.
 */
export function reRankSites(
  _projectType: ProjectType,
  _constraints: SiteConstraints,
  weights: SuitabilityWeights,
): SiteCandidate[] {
  return lastCandidates
    .map((c) => ({
      ...c,
      score: blend(c.factors, weights),
      factors: c.factors.map((f) => ({ ...f, weight: weights[f.key] ?? f.weight })),
    }))
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
