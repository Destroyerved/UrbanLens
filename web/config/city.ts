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
 * by merging member districts in memory, so no layer is ever stored twice. The
 * two legacy composites below (twin cities, metro) remain as views over the
 * same district data.
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

export const AHMEDABAD_GANDHINAGAR: CityConfig = {
  id: "ahmedabad-gandhinagar",
  name: "Ahmedabad–Gandhinagar",
  state: "Gujarat",
  blurb: "Twin cities · composite view",
  center: [72.58, 23.11],
  zoom: 10.2,
  bounds: [
    [72.40, 22.90],
    [72.76, 23.32],
  ],
  growthCenter: [72.578, 23.025],
};

export const AHMEDABAD_METRO: CityConfig = {
  id: "ahmedabad-metro",
  name: "Ahmedabad Metro Region",
  state: "Gujarat",
  blurb: "Peri-urban region · composite view",
  center: [72.55, 23.08],
  zoom: 9.3,
  bounds: [
    [72.20, 22.70],
    [72.95, 23.45],
  ],
  growthCenter: [72.578, 23.025],
};

/**
 * Active study areas — mirrors ACTIVE_DISTRICTS + REGIONS in
 * backend/app/core/config.py. The engine only serves these, so offering more
 * here would put areas in the switcher that return 404.
 *
 * Scoped to the Ahmedabad–Gandhinagar metropolitan region and the five
 * districts that border it. The generated file still holds all 34 districts, so
 * widening this is a matter of adding ids to both lists.
 */
const ACTIVE_DISTRICT_IDS = [
  "ahmedabad",
  "gandhinagar",
  "kheda",
  "mahesana",
  "sabarkantha",
  "aravalli",
  "patan",
] as const;

const byId = new Map(GUJARAT_DISTRICTS.map((c) => [c.id, c]));

/** Core cities, then the two regional views, then the bordering districts —
 *  the order the switcher shows them in. */
export const CITIES: CityConfig[] = [
  byId.get("ahmedabad"),
  byId.get("gandhinagar"),
  AHMEDABAD_GANDHINAGAR,
  AHMEDABAD_METRO,
  ...ACTIVE_DISTRICT_IDS.filter((id) => id !== "ahmedabad" && id !== "gandhinagar").map((id) =>
    byId.get(id),
  ),
].filter((c): c is CityConfig => Boolean(c));

/** Quick picks shown in the city switcher — the metropolitan set. */
export const HOT_PICKS: string[] = [
  "ahmedabad",
  "ahmedabad-metro",
  "ahmedabad-gandhinagar",
  "gandhinagar",
  "kheda",
  "mahesana",
];

/** The area the app opens on. The active one at runtime lives in the store. */
export const DEFAULT_CITY = CITIES[0];
export const ACTIVE_CITY = DEFAULT_CITY;

export function cityById(id: string): CityConfig {
  return CITIES.find((c) => c.id === id) ?? DEFAULT_CITY;
}
