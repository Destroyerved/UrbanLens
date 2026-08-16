import type { FeatureCollection } from "geojson";

/**
 * Green-space polygons (parks + green landuse) from the spatial engine.
 *
 * `setGreenspace` swaps in the active study area's layer (fetched by
 * lib/dataset.ts). Composite areas have no engine file and are set to an empty
 * collection, so the map simply has nothing to draw there.
 */

export let GREENSPACE: FeatureCollection = { type: "FeatureCollection", features: [] };

export function setGreenspace(fc: FeatureCollection) {
  GREENSPACE = fc;
}

export const GREENSPACE_READY = () => GREENSPACE.features.length > 0;