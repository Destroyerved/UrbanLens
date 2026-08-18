import type { FeatureCollection } from "geojson";

/**
 * Derived flood-susceptibility zones (high = water ±150 m, medium = 150–400 m)
 * from the spatial engine. `setFlood` swaps in the active study area's layer
 * (fetched lazily by lib/dataset.ts). Composite areas beyond the merge limit
 * have no document and are set to an empty collection, so the map simply has
 * nothing to draw there.
 */

export let FLOOD: FeatureCollection = { type: "FeatureCollection", features: [] };

export function setFlood(fc: FeatureCollection) {
  FLOOD = fc;
}

export const FLOOD_READY = () => FLOOD.features.length > 0;