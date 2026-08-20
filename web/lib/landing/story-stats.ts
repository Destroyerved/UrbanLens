/**
 * Tiny landing-page story constants.
 *
 * Keep these separate from city-layers.ts: importing the live landing GeoJSON
 * constructs the demo grid/parcels and pulls MapLibre-adjacent data into the
 * first JS chunk. The cinematic copy only needs these display values.
 */
export const LANDING_CITY_STATS = {
  parcels: 135,
  wards: 12,
  facilities: 58,
  cells: 552,
} as const;

// Successive survivors through the six illustrative site filters. These are
// display-only story numbers; the dashboard performs the real analysis.
export const LANDING_FILTER_COUNTS = [135, 38, 29, 22, 14, 10, 6] as const;

export const LANDING_FLAGSHIP = {
  areaHa: 5.2,
  floodRisk: "low",
} as const;
