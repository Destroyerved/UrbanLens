import type { AccessibilityReport, GapCategory, LngLat, WardGap } from "@/types";
import { apiGet } from "@/lib/api";

/**
 * Infrastructure, accessibility and city KPIs — served by the Python engine.
 *
 * These used to be computed in lib/analysis.ts. Two implementations meant two
 * answers for the same city; the engine is now the single source.
 */

interface ApiWardGap {
  ward_code: string;
  name: string;
  population: number;
  centroid: LngLat;
  kind: "ward" | "taluka";
  area_km2: number;
  scores: Record<GapCategory, number>;
  overall: number;
  priority: number;
}

/** How completely OpenStreetMap maps the facilities behind a service score. */
export interface CoverageNote {
  service: GapCategory;
  confidence: "high" | "medium" | "low";
  mapped: number;
  expected: number;
  note: string;
}

let gapsCache: { wards: WardGap[]; coverage: CoverageNote[] } | null = null;

export async function fetchGapsWithCoverage(): Promise<{ wards: WardGap[]; coverage: CoverageNote[] }> {
  if (gapsCache) return gapsCache;
  const res = await apiGet<{ wards: ApiWardGap[]; coverage: CoverageNote[] }>("/api/infrastructure/gaps");
  gapsCache = {
    wards: res.wards.map((w) => ({
      wardId: w.ward_code,
      wardName: w.name,
      population: w.population,
      scores: w.scores,
      overall: w.overall,
      // The engine calls this `priority`: population weighted by unmet need.
      affectedPopulation: w.priority,
    })),
    coverage: res.coverage,
  };
  return gapsCache;
}

export async function fetchWardGaps(): Promise<WardGap[]> {
  return (await fetchGapsWithCoverage()).wards;
}

const FACILITY_LABEL: Record<string, string> = {
  hospital: "Hospital", clinic: "Clinic", school: "School", park: "Park",
  bus_stop: "Bus Stop", metro_station: "Metro", government_office: "Govt. Office",
};

export async function analyzeAccessibility(point: LngLat): Promise<AccessibilityReport> {
  const res = await apiGet<{
    score: number;
    items: { facility_type: string; minutes: number; reachable: boolean }[];
  }>("/api/accessibility", { lng: point[0], lat: point[1] });
  return {
    score: res.score,
    items: res.items.map((i) => ({
      label: FACILITY_LABEL[i.facility_type] ?? i.facility_type,
      minutes: i.minutes,
      ok: i.reachable,
    })),
  };
}

export async function fetchLivability(wardId: string) {
  const res = await apiGet<{
    city_score: number;
    wards: { ward_code: string; score: number; band: string; components: Record<string, number> }[];
  }>("/api/livability");
  const ward = res.wards.find((w) => w.ward_code === wardId) ?? res.wards[0];
  return {
    cityScore: res.city_score,
    score: ward?.score ?? 0,
    band: ward?.band ?? "moderate",
    components: ward?.components ?? {},
  };
}

export async function fetchCityKpis() {
  const [overview, gaps] = await Promise.all([
    apiGet<{
      population: number;
      urban_growth_pct: number;
      total_parcels: number;
      government_parcels: number;
      vacant_government_area_ha: number;
      infrastructure_deficit_wards: number;
      zoning_conflicts: number;
    }>("/api/overview"),
    fetchGapsWithCoverage(),
  ]);

  // Healthcare coverage is population-weighted across wards — a city figure,
  // not an average of ward scores, which would let a tiny ward swing it.
  const totalPop = gaps.wards.reduce((s, w) => s + w.population, 0) || 1;
  const covered = gaps.wards.reduce((s, w) => s + w.population * (w.scores.healthcare / 100), 0);

  return {
    population: overview.population,
    growthPct: overview.urban_growth_pct,
    totalParcels: overview.total_parcels,
    govtParcels: overview.government_parcels,
    vacantGovtHa: overview.vacant_government_area_ha,
    deficitWards: overview.infrastructure_deficit_wards,
    zoningConflicts: overview.zoning_conflicts,
    healthcareCoveragePct: Math.round((covered / totalPop) * 100),
    underservedPop: Math.round(totalPop - covered),
  };
}
