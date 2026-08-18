import type { FeatureCollection } from "geojson";

/**
 * Water-body polygons (lakes, reservoirs, wetlands, rivers) from the spatial
 * engine. `setWater` swaps in the active study area's layer (fetched lazily by
 * lib/dataset.ts). Composite areas beyond the merge limit have no document and
 * are set to an empty collection, so the map simply has nothing to draw there.
 */

export let WATER: FeatureCollection = { type: "FeatureCollection", features: [] };

export function setWater(fc: FeatureCollection) {
  WATER = fc;
}

export const WATER_READY = () => WATER.features.length > 0;