import { apiGet, apiPost, getApiCity } from "@/lib/api";
import type { LngLat } from "@/types";

/**
 * Environmental and governance analytics — conservation priority, encroachment
 * screening and linear-corridor routing.
 *
 * All three are computed by the engine from measured layers only (OSM water and
 * green space, Sentinel-2 NDVI, DEM flood, Census population, OSM roads). None
 * of them touches parcels' modelled ownership or zoning, which is deliberate:
 * each makes a claim — land worth protecting, land possibly built on illegally,
 * land a road should cross — that would be indefensible on generated data.
 */

export interface ConservationCell {
  centroid: LngLat;
  sensitivity: number;
  pressure: number;
  priority: number;
  risk_category: string | null;
  components: { green: number; water: number; ndvi: number; flood: number };
  at_risk: boolean;
}

export interface ConservationReport {
  city: string;
  cell_count: number;
  weights: Record<string, number>;
  thresholds: { sensitivity_min: number; pressure_min: number };
  summary: {
    cells_at_risk: number;
    share_at_risk_pct: number;
    mean_sensitivity: number;
    peak_priority: number;
  };
  priorities: ConservationCell[];
  cells: ConservationCell[];
}

export interface EncroachmentCandidate {
  parcel_id: string;
  ward: string;
  land_use: string;
  parcel_source: string;
  centroid: LngLat;
  intrudes_on: "water" | "green";
  target_name: string;
  target_category: string | null;
  target_source: string | null;
  overlap_sqm: number;
  overlap_pct: number;
  confidence: "likely" | "review";
}

export interface EncroachmentReport {
  city: string;
  thresholds: { min_sqm: number; min_fraction: number };
  summary: {
    candidates: number;
    on_water: number;
    on_green: number;
    likely: number;
    needs_review: number;
    total_overlap_ha: number;
    water_overlap_ha: number;
    green_overlap_ha: number;
  };
  candidates: EncroachmentCandidate[];
}

export interface CorridorResult {
  city: string;
  found: boolean;
  reason?: string;
  path: LngLat[];
  cells: number;
  length_km: number;
  straight_km: number;
  detour_pct: number;
  clamped: boolean;
  snapped: { start: LngLat; end: LngLat };
  impact: {
    population_served: number;
    water_crossings: number;
    green_cells: number;
    flood_cells: number;
    existing_road_cells: number;
    reuse_pct: number;
  };
}

export interface ProvenanceLayer {
  source: string;
  label: string;
  detail: string;
}

export interface ProvenanceReport {
  city: string;
  layers: Record<string, ProvenanceLayer>;
  rollup: {
    measured: number;
    derived: number;
    modelled: number;
    total: number;
    measured_pct: number;
  };
}

function cached<T>(store: Map<string, Promise<T>>, path: string): Promise<T> {
  const city = getApiCity();
  const hit = store.get(city);
  if (hit) return hit;
  const pending = apiGet<T>(path, { city }).catch((err) => {
    store.delete(city);
    throw err;
  });
  store.set(city, pending);
  return pending;
}

const conservationCache = new Map<string, Promise<ConservationReport>>();
const encroachmentCache = new Map<string, Promise<EncroachmentReport>>();
const provenanceCache = new Map<string, Promise<ProvenanceReport>>();

export const fetchConservation = () =>
  cached<ConservationReport>(conservationCache, "/api/conservation");
export const fetchEncroachment = () =>
  cached<EncroachmentReport>(encroachmentCache, "/api/encroachment");
export const fetchProvenance = () =>
  cached<ProvenanceReport>(provenanceCache, "/api/provenance");

/** Least-cost alignment between two points. Not cached — it is per-request.
 *  `city` is appended by lib/api's url(), so it is not passed here. */
export async function routeCorridor(from: LngLat, to: LngLat): Promise<CorridorResult> {
  return apiPost<CorridorResult>("/api/corridor", {
    from_lng: from[0],
    from_lat: from[1],
    to_lng: to[0],
    to_lat: to[1],
  });
}

export const SOURCE_TONE: Record<string, string> = {
  official: "text-emerald-500",
  osm: "text-sky-500",
  satellite: "text-violet-500",
  derived: "text-amber-500",
  synthetic: "text-red-500",
};

export const SOURCE_WORD: Record<string, string> = {
  official: "Official",
  osm: "OpenStreetMap",
  satellite: "Satellite",
  derived: "Derived",
  synthetic: "Modelled",
};
