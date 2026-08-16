import type { FeatureCollection } from "geojson";

/**
 * Per-ward vegetation (Sentinel-2 NDVI) from the spatial engine.
 *
 * `setVegetation` swaps in the active study area's layer (fetched by
 * lib/dataset.ts). Composite areas (`ahmedabad-gandhinagar`, `ahmedabad-metro`)
 * have no engine file and are set to an empty collection, so the map simply
 * has nothing to draw there.
 */

export let VEGETATION: FeatureCollection = { type: "FeatureCollection", features: [] };

export function setVegetation(fc: FeatureCollection) {
  VEGETATION = fc;
}

export const VEGETATION_READY = () => VEGETATION.features.length > 0;