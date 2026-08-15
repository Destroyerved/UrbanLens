import type { Map as MLMap } from "maplibre-gl";

/** Singleton handle so floating controls can drive the always-mounted map. */
let instance: MLMap | null = null;

export function setMapInstance(map: MLMap | null) {
  instance = map;
}

export function getMapInstance(): MLMap | null {
  return instance;
}
