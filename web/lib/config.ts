/**
 * City configuration. The whole platform is parameterised by a City object so
 * that Ahmedabad is only the *default* demo city, never hard-coded into logic.
 * Loading another city later means adding another entry here.
 */

export interface CityConfig {
  id: string;
  name: string;
  state: string;
  /** Short code used in parcel identifiers, e.g. GJ-AHD-01234. */
  code: string;
  /** [lng, lat] of the city centre used for radial growth/scoring. */
  center: [number, number];
  /** Bounding box [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number];
  /** Approx city radius in km used to shape the urban footprint. */
  radiusKm: number;
  /** Population used to calibrate demo density (people). */
  population: number;
  /** Default map zoom. */
  zoom: number;
}

export const AHMEDABAD: CityConfig = {
  id: "ahmedabad",
  name: "Ahmedabad",
  state: "Gujarat",
  code: "AHD",
  center: [72.5714, 23.0225],
  /** Extent of the 48 real AMC wards (see scripts/build-wards.mjs). */
  bbox: [72.4493, 22.9139, 72.7015, 23.1405],
  radiusKm: 14,
  /** AMC area only — Census 2011 (5,570,585) projected to 2026. */
  population: 7_200_000,
  zoom: 11.2,
};

export const GANDHINAGAR: CityConfig = {
  id: "gandhinagar",
  name: "Gandhinagar",
  state: "Gujarat",
  code: "GNR",
  center: [72.6369, 23.2231],
  /** Extent of the 11 real GMC wards. */
  bbox: [72.5408, 23.0883, 72.7008, 23.3113],
  radiusKm: 13,
  /** GMC area — Census 2011 (208,299) projected to 2026. */
  population: 350_000,
  zoom: 11.4,
};

export const CITIES: Record<string, CityConfig> = {
  ahmedabad: AHMEDABAD,
  gandhinagar: GANDHINAGAR,
};

export const DEFAULT_CITY = AHMEDABAD;

/** Deterministic seed so demo data + every derived score is stable across runs. */
export const DATA_SEED = 20260814;
