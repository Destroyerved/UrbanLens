import type { FactorScore, Parcel, SuitabilityWeights } from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";
import { PARCELS, PARCEL_BY_ID } from "@/data/parcels";
import { apiGet, apiPost } from "@/lib/api";

/**
 * Parcels.
 *
 * The parcel layer itself is synced from the engine at build time (it does not
 * change at runtime), so listing is local. The intelligence profile — scores,
 * recommended uses, 15-minute access — is fetched, because those are analysis.
 */

export async function fetchParcels(): Promise<Parcel[]> {
  return PARCELS;
}

export async function fetchParcel(id: string): Promise<Parcel | null> {
  return PARCEL_BY_ID.get(id) ?? null;
}

export interface ParcelIntel {
  hospital: { score: number; factors: FactorScore[] };
  recs: { type: string; label: string; score: number }[];
  access: { score: number; items: { label: string; minutes: number; ok: boolean }[] };
  development: number;
}

interface ApiParcelDetail {
  parcel_id: string;
  centroid: [number, number];
  scores: {
    accessibility: number;
    infrastructure_readiness: number;
    environmental_suitability: number;
    development_potential: number;
    transit: number;
  };
  recommended_uses: { project: string; label: string; score: number }[];
}

interface ApiSuitability {
  final: number;
  breakdown: Record<string, number>;
  unserved: number;
  metrics: { road_km: number; flood_risk: string; ownership: string; area_acres: number };
}

const FACTOR: Record<string, { key: keyof SuitabilityWeights; label: string }> = {
  accessibility: { key: "accessibility", label: "Accessibility" },
  population_need: { key: "populationNeed", label: "Population Need" },
  transit: { key: "transit", label: "Transit" },
  infrastructure: { key: "infrastructure", label: "Infrastructure" },
  environment: { key: "environment", label: "Environment" },
  land_compatibility: { key: "landCompatibility", label: "Land Compatibility" },
};

/** Everything the parcel drawer shows, in three parallel requests. */
export async function fetchParcelIntel(parcelId: string): Promise<ParcelIntel> {
  const detail = await apiGet<ApiParcelDetail>(`/api/parcels/${encodeURIComponent(parcelId)}`);
  const [suit, access] = await Promise.all([
    apiPost<ApiSuitability>("/api/suitability/calculate", {
      parcel_id: parcelId,
      project_type: "hospital",
    }),
    apiGet<{ score: number; items: { facility_type: string; minutes: number; reachable: boolean }[] }>(
      "/api/accessibility",
      { lng: detail.centroid[0], lat: detail.centroid[1] },
    ),
  ]);

  const factors: FactorScore[] = Object.entries(suit.breakdown)
    .filter(([k]) => FACTOR[k])
    .map(([k, score]) => ({
      key: FACTOR[k].key,
      label: FACTOR[k].label,
      score: Math.round(score),
      weight: DEFAULT_WEIGHTS[FACTOR[k].key],
      detail: "",
    }));

  const LABEL: Record<string, string> = {
    hospital: "Healthcare Facility",
    school: "Educational Institution",
    park: "Urban Park / Green Space",
    residential: "Residential Development",
    commercial: "Commercial Hub",
    affordable_housing: "Affordable Housing",
  };

  return {
    hospital: { score: suit.final, factors },
    recs: detail.recommended_uses.map((r) => ({
      type: r.project,
      label: LABEL[r.project] ?? r.label,
      score: r.score,
    })),
    access: {
      score: access.score,
      items: access.items.map((i) => ({
        label: i.facility_type.replace(/_/g, " "),
        minutes: i.minutes,
        ok: i.reachable,
      })),
    },
    development: detail.scores.development_potential,
  };
}


export interface SimilarParcel {
  parcel_id: string;
  similarity: number;
  centroid: [number, number];
  area_acres: number;
  land_use: string;
  ownership: string;
  flood_risk: string;
  development_potential: number;
}

/** FAISS-backed nearest-neighbour search over the selected parcel's planning profile. */
export async function fetchSimilarParcels(parcelId: string, limit = 10) {
  return apiGet<{
    backend: string;
    dimensions: number;
    feature_names: string[];
    indexed_parcels: number;
    results: SimilarParcel[];
  }>(`/api/parcels/${encodeURIComponent(parcelId)}/similar`, { limit });
}
