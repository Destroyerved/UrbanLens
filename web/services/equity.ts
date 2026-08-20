import { apiGet, getApiCity } from "@/lib/api";
import type { LngLat } from "@/types";

/**
 * Service equity — how provision is distributed across the city's *people*.
 *
 * /api/infrastructure/gaps and /api/livability both rank wards. This answers
 * the questions that follow and that a ranking cannot: how unevenly provision
 * is spread, how many residents fall below the service floor, which shortfall
 * is the systematic one, and where a fix reaches the most people.
 *
 * Every figure originates in the engine (app/gis/analysis.py :: equity), which
 * derives it from livability() — so this panel and the Infrastructure panel
 * can never tell different stories about the same ward.
 */

export interface EquityDistribution {
  gini: number;
  p10: number;
  p50: number;
  p90: number;
  p90_p10_ratio: number | null;
}

export interface EquityWard {
  ward_code: string;
  name: string;
  population: number;
  centroid: LngLat;
  score: number;
  band: string;
  shortfall: number;
  weakest_component: string | null;
  weakest_score: number | null;
  people_below_floor: number;
  priority: number;
}

export interface EquityReport {
  city: string;
  population_total: number;
  /** Service floor for THIS city — 60% of its own population-weighted median. */
  floor: number;
  floor_basis: "relative" | "absolute";
  floor_detail: string;
  median_score: number;
  /** What the city already achieves for its best-served tenth — the
   *  target the priority ranking measures every ward against. */
  target_score: number;
  wards: EquityWard[];
  inequality: Record<string, EquityDistribution>;
  most_unequal_service: string;
  deprivation: {
    wards_below_floor: number;
    ward_count: number;
    population_below_floor: number;
    population_share_pct: number;
    /** The fixed livability floor, carried so a relative reading of 0% cannot
     *  be mistaken for a district that is actually well served. */
    absolute_floor: number;
    wards_below_absolute: number;
    population_below_absolute: number;
    absolute_share_pct: number;
  };
  priorities: EquityWard[];
}

const cache = new Map<string, Promise<EquityReport>>();

export async function fetchEquity(): Promise<EquityReport> {
  const city = getApiCity();
  const hit = cache.get(city);
  if (hit) return hit;
  const pending = apiGet<EquityReport>("/api/equity", { city }).catch((err) => {
    cache.delete(city);
    throw err;
  });
  cache.set(city, pending);
  return pending;
}

export const SERVICE_LABEL: Record<string, string> = {
  healthcare: "Healthcare",
  education: "Education",
  green_space: "Green space",
  transportation: "Transport",
  public_services: "Public services",
  road_connectivity: "Road connectivity",
  environmental_quality: "Environmental quality",
};
