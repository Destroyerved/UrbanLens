/**
 * UrbanLens — Cinematic 3D Earth & Gujarat Intelligence Globe
 */

import { scrollState } from "./lib/scroll";

export { default as CinematicGlobe } from "./CinematicGlobe";
export type { CinematicGlobeProps } from "./CinematicGlobe";

export { default as GlobeCanvas } from "./GlobeCanvas";
export type { GlobeCanvasProps } from "./GlobeCanvas";

export { default as Globe } from "./Globe";
export type { GlobeProps } from "./Globe";

export { default as CityMarkers } from "./CityMarkers";
export type { CityMarkersProps } from "./CityMarkers";

export { default as GujaratOutline } from "./GujaratOutline";
export type { GujaratOutlineProps } from "./GujaratOutline";

export { default as Stars } from "./Stars";
export { default as FallbackGlobe } from "./FallbackGlobe";

export {
  createEarthMaterial,
  createCloudsMaterial,
  createAtmosphereMaterial,
  createFallbackMaterial,
  SUN_DIR,
} from "./materials";

export { scrollState, smooth } from "./lib/scroll";
export { CITIES, GUJARAT_CENTER, latLonToVec3 } from "./lib/geo";
export type { City } from "./lib/geo";
export { CAMERA_KEYS, SCENES, evalCamera } from "./lib/story";
export type { CamKey, Scene } from "./lib/story";

// Convenience helper to set scroll progress
export function setProgress(p: number) {
  scrollState.progress = Math.max(0, Math.min(1, p));
}
