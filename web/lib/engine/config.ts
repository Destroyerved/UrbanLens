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
  /**
   * Urban cores, when the area has more than one. The urban-intensity field
   * takes the strongest value across cores, and distance-based attributes use
   * the nearest — otherwise a twin-city region would peak in the empty corridor
   * between its two cities instead of at either one. Defaults to [center].
   */
  cores?: [number, number][];
  /** Bounding box [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number];
  /** Approx city radius in km used to shape the urban footprint. */
  radiusKm: number;
  /** Population used to calibrate demo density (people). */
  population: number;
  /** Default map zoom. */
  zoom: number;
  /**
   * Named directions of urban expansion, measured from the primary core.
   * Defaults to Ahmedabad's when unset.
   */
  corridors?: CorridorConfig[];
}

export interface CorridorConfig {
  name: string;
  /** Compass bearing from the primary core, degrees (0 = N, 90 = E). */
  bearing: number;
  /** Angular half-width used for falloff. */
  width: number;
  /** How far built-up development extends along this direction, km. */
  reachKm: number;
  risk: "Very High" | "High" | "Moderate";
}

/** Ahmedabad's expansion corridors — the default for any city without its own. */
export const DEFAULT_CORRIDORS: CorridorConfig[] = [
  { name: "North-West Corridor", bearing: 320, width: 40, reachKm: 12.5, risk: "Very High" },
  { name: "SP Ring Road South", bearing: 190, width: 38, reachKm: 11, risk: "High" },
  { name: "Eastern Industrial Corridor", bearing: 95, width: 34, reachKm: 11, risk: "High" },
];

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

/**
 * The Ahmedabad–Gandhinagar conurbation. The corridor between the two cities —
 * GIFT City, Adalaj, the SG Highway spine — is where the metropolitan area is
 * actually expanding, and neither municipality sees it when analysed alone.
 *
 * Composed from both municipal datasets by scripts/build-region.mjs. The two
 * ward sets overlap by only 0.8 km² (0.1%), which is digitisation noise at the
 * shared boundary rather than a real jurisdictional conflict.
 */
export const AHMEDABAD_GANDHINAGAR: CityConfig = {
  id: "ahmedabad-gandhinagar",
  name: "Ahmedabad–Gandhinagar",
  state: "Gujarat",
  code: "AGR",
  center: [72.58, 23.11],
  cores: [AHMEDABAD.center, GANDHINAGAR.center],
  /** Extent of all 59 wards across both municipalities. */
  bbox: [72.4493, 22.9139, 72.7015, 23.3113],
  radiusKm: 26,
  /** AMC 7.2M + GMC 350k, each projected to 2026 from its own Census 2011 base. */
  population: 7_550_000,
  zoom: 10.2,
  /**
   * Ahmedabad's corridors plus the one that only exists at regional scale: the
   * northward spine to Gandhinagar through GIFT City and Adalaj, which is the
   * conurbation's principal growth axis and is invisible to either municipality
   * analysed on its own.
   */
  corridors: [
    { name: "Gandhinagar Corridor", bearing: 8, width: 26, reachKm: 26, risk: "Very High" },
    ...DEFAULT_CORRIDORS,
  ],
};

/**
 * The metropolitan region: both municipalities plus the peri-urban talukas
 * around them. This is the scale at which land actually changes use — the
 * farmland on the fringe is where the next decade of development lands, and it
 * sits entirely outside every corporation limit.
 *
 * Composed by scripts/build-metro.mjs. Municipal wards keep their own
 * populations; taluka remnants carry a density derived by subtracting municipal
 * Census 2011 counts from district Census 2011 counts.
 */
export const AHMEDABAD_METRO: CityConfig = {
  id: "ahmedabad-metro",
  name: "Ahmedabad Metro Region",
  state: "Gujarat",
  code: "AMR",
  center: [72.55, 23.08],
  cores: [AHMEDABAD.center, GANDHINAGAR.center],
  /** 59 municipal wards + 5 clipped peri-urban talukas. */
  bbox: [72.0893, 22.7706, 72.8426, 23.4355],
  radiusKm: 45,
  /** AMC + GMC projections plus the derived peri-urban remainder. */
  population: 8_651_395,
  zoom: 9.3,
  corridors: [
    { name: "Gandhinagar Corridor", bearing: 8, width: 26, reachKm: 26, risk: "Very High" },
    ...DEFAULT_CORRIDORS,
  ],
};

export const CITIES: Record<string, CityConfig> = {
  ahmedabad: AHMEDABAD,
  gandhinagar: GANDHINAGAR,
  "ahmedabad-gandhinagar": AHMEDABAD_GANDHINAGAR,
  "ahmedabad-metro": AHMEDABAD_METRO,
};

export const DEFAULT_CITY = AHMEDABAD;

/** Deterministic seed so demo data + every derived score is stable across runs. */
export const DATA_SEED = 20260814;
