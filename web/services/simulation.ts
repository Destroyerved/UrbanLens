import type { ProjectType, SimulationResult } from "@/types";
import { apiPost } from "@/lib/api";
import { PARCEL_BY_ID } from "@/data/parcels";
import { WARD_BY_ID } from "@/data/wards";

/**
 * What-if simulation — computed by the Python engine (PRD §26–27).
 *
 * The engine returns two framings and the UI shows both: a local analysis
 * window around the site, which answers "does this help here", and a citywide
 * pair, which answers "does it move the city". A large local gain can be a
 * rounding error at city scale, and a planner should see that rather than only
 * the flattering number.
 */

interface ApiSimulation {
  applicable: boolean;
  service_radius_km: number;
  analysis_radius_km: number;
  window_population: number;
  residents_newly_covered: number;
  coverage_before_pct: number;
  coverage_after_pct: number;
  avg_distance_before_km: number;
  avg_distance_after_km: number;
  citywide: {
    coverage_before_pct: number;
    coverage_after_pct: number;
    covered_before: number;
    covered_after: number;
    total_population: number;
  };
  accessibility_before: number;
  accessibility_after: number;
  ward_name: string | null;
  livability_before: number | null;
  livability_after: number | null;
}

export async function runSimulation(
  parcelId: string,
  projectType: ProjectType,
): Promise<SimulationResult> {
  const parcel = PARCEL_BY_ID.get(parcelId);
  if (!parcel) throw new Error(`Unknown parcel ${parcelId}`);

  const r = await apiPost<ApiSimulation>("/api/scenarios/simulate", {
    project_type: projectType,
    lng: parcel.centroid[0],
    lat: parcel.centroid[1],
  });

  const ward = WARD_BY_ID.get(parcel.wardId);
  const windowPop = r.window_population;

  return {
    projectType,
    parcelId,
    wardName: r.ward_name ?? ward?.name ?? parcel.wardId,
    serviceRadiusKm: r.service_radius_km,
    // Citywide — the honest denominator.
    before: {
      coveragePct: Math.round(r.citywide.coverage_before_pct),
      avgDistKm: r.avg_distance_before_km,
      coveredPop: r.citywide.covered_before,
      totalPop: r.citywide.total_population,
    },
    after: {
      coveragePct: Math.round(r.citywide.coverage_after_pct),
      avgDistKm: r.avg_distance_after_km,
      coveredPop: r.citywide.covered_after,
      totalPop: r.citywide.total_population,
    },
    // The local analysis window around the site.
    corridorBefore: {
      coveragePct: Math.round(r.coverage_before_pct),
      avgDistKm: r.avg_distance_before_km,
      coveredPop: Math.round(windowPop * (r.coverage_before_pct / 100)),
      totalPop: windowPop,
    },
    corridorAfter: {
      coveragePct: Math.round(r.coverage_after_pct),
      avgDistKm: r.avg_distance_after_km,
      coveredPop: Math.round(windowPop * (r.coverage_after_pct / 100)),
      totalPop: windowPop,
    },
    newlyCovered: r.residents_newly_covered,
    accessibilityBefore: r.accessibility_before,
    accessibilityAfter: r.accessibility_after,
    // Ward livability. The engine states this as an estimate: the share of the
    // ward newly covered closes that fraction of the matching component's
    // remaining headroom, re-blended with the published weights.
    livabilityBefore: r.livability_before ?? 0,
    livabilityAfter: r.livability_after ?? r.livability_before ?? 0,
    center: parcel.centroid,
    radiusKm: r.service_radius_km,
  };
}
