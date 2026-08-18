import { clamp, lerp, smoothstep } from "./geo";

export const GLOBE_STAGES = ["earth", "india", "gujarat", "cities", "complete"] as const;
export type GlobeStage = (typeof GLOBE_STAGES)[number];

/** Where each stage begins along the 0 → 1 scroll timeline. */
export const STAGE_START: Record<GlobeStage, number> = {
  earth: 0,
  india: 0.22,
  gujarat: 0.45,
  cities: 0.68,
  complete: 0.92,
};

export function stageForProgress(p: number): GlobeStage {
  if (p >= STAGE_START.complete) return "complete";
  if (p >= STAGE_START.cities) return "cities";
  if (p >= STAGE_START.gujarat) return "gujarat";
  if (p >= STAGE_START.india) return "india";
  return "earth";
}

export interface CameraKey {
  /** camera distance in Earth radii */
  distance: number;
  /** how strongly the globe is aimed at India (0 → 1) */
  indiaLock: number;
  /** how strongly the globe is aimed at Gujarat (0 → 1) */
  gujaratLock: number;
  /** screen offset of the globe, in viewport units (-1 … 1) */
  offsetX: number;
  offsetY: number;
  /** idle spin multiplier */
  spin: number;
}

/**
 * Camera choreography. One continuous curve — no snapping between stages, the
 * locks simply cross-fade so the planet always eases onto its next target.
 */
export function cameraForProgress(p: number, compact: boolean): CameraKey {
  // 4.5 radii (whole planet) → 1.78 (the whole state, comfortably framed)
  const distance = lerp(
    lerp(4.5, 3.15, smoothstep(0.04, 0.34, p)),
    lerp(2.35, 1.78, smoothstep(0.58, 0.92, p)),
    smoothstep(0.34, 0.62, p)
  );

  return {
    distance: distance + (compact ? 0.85 : 0),
    indiaLock: smoothstep(0.1, 0.28, p) * (1 - smoothstep(0.3, 0.46, p)),
    gujaratLock: smoothstep(0.3, 0.5, p),
    // the globe starts right of the hero copy, then centres; at the end it
    // lifts slightly so the caption never sits on top of the state
    offsetX: compact ? 0 : lerp(0.16, 0, smoothstep(0.0, 0.34, p)),
    offsetY: compact
      ? lerp(-0.34, 0.12, smoothstep(0, 0.6, p))
      : lerp(-0.16, 0.14, smoothstep(0.3, 0.75, p)),
    spin: 1 - smoothstep(0.08, 0.34, p) * 0.88,
  };
}

/** Opacity/intensity of every optional layer, as one pure function of scroll. */
export function layersForProgress(p: number) {
  const win = (a: number, b: number, c = 9, d = 9) =>
    smoothstep(a, b, p) * (1 - smoothstep(c, d, p));

  return {
    /** graticule + India highlight */
    graticule: win(0.14, 0.3, 0.9, 1.0),
    indiaGlow: win(0.16, 0.3, 0.36, 0.48),
    gujaratOutline: win(0.4, 0.52),
    gujaratGlow: win(0.42, 0.54),
    grid: win(0.5, 0.64, 0.94, 1.0),
    scan: win(0.5, 0.62, 0.86, 0.96),
    cities: win(0.58, 0.7),
    labels: win(0.66, 0.78),
    links: win(0.7, 0.82),
    /** the whole scene dims slightly as the page hands over to the next section */
    handover: smoothstep(0.9, 1.0, p),
  };
}

export { clamp, lerp, smoothstep };
