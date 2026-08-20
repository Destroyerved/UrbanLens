/**
 * UrbanLens — cinematic Gujarat globe module.
 *
 * Usage:
 *   import { GujaratGlobeHero } from "@/components/urbanlens-globe";
 *   <GujaratGlobeHero />
 */

export { default as GujaratGlobeHero } from "./GujaratGlobeHero";
export type { GujaratGlobeHeroProps, GlobeStageCopy } from "./GujaratGlobeHero";

export { default as GlobeCanvas } from "./GlobeCanvas";
export type { GlobeCanvasProps } from "./GlobeCanvas";

export { default as GlobeScrollController } from "./GlobeScrollController";
export { default as Earth } from "./Earth";
export { default as Clouds } from "./Clouds";
export { default as Atmosphere } from "./Atmosphere";
export { default as Starfield } from "./Starfield";
export { default as GujaratOverlay } from "./GujaratOverlay";
export { default as CityMarkers } from "./CityMarkers";
export { default as CityLinks } from "./CityLinks";

export {
  GUJARAT_CITIES,
  GUJARAT_LINKS,
  GUJARAT_CENTER,
  INDIA_CENTER,
  cityById,
} from "./data/gujaratCities";
export type { GlobeCity } from "./data/gujaratCities";
export { GUJARAT_OUTLINE, GUJARAT_BOUNDS } from "./data/gujaratOutline";

export { globeState, useGlobeSnapshot, setProgress } from "./lib/store";
export {
  GLOBE_STAGES,
  STAGE_START,
  stageForProgress,
  cameraForProgress,
  layersForProgress,
} from "./lib/stage";
export type { GlobeStage } from "./lib/stage";
export { latLngToVec3, faceRotation, arcPoints } from "./lib/geo";
