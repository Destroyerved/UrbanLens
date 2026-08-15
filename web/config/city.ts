import type { LngLat } from "@/types";

/**
 * City configuration. Only Ahmedabad ships in the demo, but nothing else in
 * the app is hard-coded to it — add another entry here + a dataset and the
 * selector picks it up.
 */
export interface CityConfig {
  id: string;
  name: string;
  state: string;
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
  center: [72.571, 23.026],
  zoom: 11.15,
  bounds: [
    [72.42, 22.915],
    [72.72, 23.155],
  ],
  growthCenter: [72.578, 23.025],
};

export const CITIES: CityConfig[] = [AHMEDABAD];
export const ACTIVE_CITY = AHMEDABAD;
