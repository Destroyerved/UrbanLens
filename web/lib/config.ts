/**
 * City configuration. The whole platform is parameterised by a City object so
 * that Ahmedabad is only the *default* demo city, never hard-coded into logic.
 * Loading another city later means adding another entry here.
 */

export interface CityConfig {
  id: string;
  name: string;
  state: string;
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
  center: [72.5714, 23.0225],
  bbox: [72.46, 22.94, 72.69, 23.13],
  radiusKm: 12,
  population: 8_400_000,
  zoom: 11.2,
};

export const CITIES: Record<string, CityConfig> = {
  ahmedabad: AHMEDABAD,
};

export const DEFAULT_CITY = AHMEDABAD;

/** Deterministic seed so demo data + every derived score is stable across runs. */
export const DATA_SEED = 20260814;

/**
 * All datasets in this build are SYNTHETIC and generated deterministically for
 * demonstration. They are realistic in structure and spatial behaviour but are
 * NOT official GLIS records. The UI must surface this label wherever data is shown.
 */
export const DATA_PROVENANCE = "demo" as const;
