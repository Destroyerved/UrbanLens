import type { LngLat } from "@/types";
import { GUJARAT_DISTRICTS } from "@/config/gujarat";

/**
 * Study areas.
 *
 * These mirror `backend/app/core/config.py` — the engine is the authority on
 * what exists, and every route takes `?city=`. The entries here carry only what
 * the client needs before any data has loaded: a name to show and a camera to
 * open on.
 *
 * ── NO DATA DUPLICATION ─────────────────────────────────────────────────────
 * The 34 districts come from gujarat.ts, generated from real boundary data
 * (web/data/engine/gujarat_config.json). The Gujarat composite stays in the
 * generated file (the thermal/boundary engine uses its extent) but is not
 * offered as a selectable area. Composites are views: the backend resolves them
 * by merging member districts in memory, so no layer is ever stored twice.
 */
export interface CityConfig {
  id: string;
  name: string;
  state: string;
  /** Short line for the switcher — what this area is for. */
  blurb: string;
  center: LngLat;
  zoom: number;
  bounds: [LngLat, LngLat];
  /** Urban core used by the growth model */
  growthCenter: LngLat;
}

export const CITIES: CityConfig[] = [
  ...GUJARAT_DISTRICTS.filter((c) => c.id !== "gujarat"),
];

/**
 * Quick picks shown in the city switcher. Gujarat's big districts; the search
 * box covers the remaining 29.
 */
export const HOT_PICKS: string[] = [
  "ahmedabad",
  "surat",
  "vadodara",
  "rajkot",
  "bhavnagar",
  "gandhinagar",
  "jamnagar",
  "junagadh",
  "kutch",
];

/** The area the app opens on. The active one at runtime lives in the store. */
export const DEFAULT_CITY = CITIES[0];
export const ACTIVE_CITY = DEFAULT_CITY;

export function cityById(id: string): CityConfig {
  return CITIES.find((c) => c.id === id) ?? DEFAULT_CITY;
}
