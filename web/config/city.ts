import type { LngLat } from "@/types";

/**
 * Study areas.
 *
 * These mirror `backend/app/core/config.py` — the engine is the authority on
 * what exists, and every route takes `?city=`. The entries here carry only what
 * the client needs before any data has loaded: a name to show and a camera to
 * open on.
 *
 * The two composite areas are not merely bigger crops. Ahmedabad and
 * Gandhinagar are separate municipal corporations, so a facility in one serves
 * residents of the other without appearing in its ward statistics; analysing
 * them together is what surfaces the corridor between them, which is where most
 * of the region's growth is.
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

export const AHMEDABAD: CityConfig = {
  id: "ahmedabad",
  name: "Ahmedabad",
  state: "Gujarat",
  blurb: "AMC area · 48 wards",
  center: [72.571, 23.026],
  zoom: 11.15,
  bounds: [
    [72.42, 22.915],
    [72.72, 23.155],
  ],
  growthCenter: [72.578, 23.025],
};

export const GANDHINAGAR: CityConfig = {
  id: "gandhinagar",
  name: "Gandhinagar",
  state: "Gujarat",
  blurb: "State capital · 11 wards",
  center: [72.6369, 23.2231],
  zoom: 11.4,
  bounds: [
    [72.55, 23.14],
    [72.73, 23.31],
  ],
  growthCenter: [72.6369, 23.2231],
};

export const AHMEDABAD_GANDHINAGAR: CityConfig = {
  id: "ahmedabad-gandhinagar",
  name: "Ahmedabad–Gandhinagar",
  state: "Gujarat",
  blurb: "Twin cities · 59 wards",
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
  blurb: "Peri-urban talukas · 64 units",
  center: [72.55, 23.08],
  zoom: 9.3,
  bounds: [
    [72.20, 22.70],
    [72.95, 23.45],
  ],
  growthCenter: [72.578, 23.025],
};

export const CITIES: CityConfig[] = [
  AHMEDABAD,
  GANDHINAGAR,
  AHMEDABAD_GANDHINAGAR,
  AHMEDABAD_METRO,
];

/** The area the app opens on. The active one at runtime lives in the store. */
export const DEFAULT_CITY = AHMEDABAD;
export const ACTIVE_CITY = DEFAULT_CITY;

export function cityById(id: string): CityConfig {
  return CITIES.find((c) => c.id === id) ?? DEFAULT_CITY;
}
