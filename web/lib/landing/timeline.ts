/**
 * The cinematic timeline.
 *
 * A single mutable number — `stage.T` — advances from 0 to 14 as the visitor
 * scrolls (integer part = scene index, fraction = progress inside that scene).
 * The Earth, the city map and every scene overlay read it on their own
 * animation frame, so scrolling never triggers a React render.
 */

import { CITY } from "./story";

export const SCENE_COUNT = 14;

export const SCENES = {
  hero: 0,
  problem: 1,
  metrics: 2,
  locate: 3,
  observe: 4,
  predict: 5,
  understand: 6,
  identify: 7,
  recommend: 8,
  simulate: 9,
  explain: 10,
  quiet: 11,
  positioning: 12,
  final: 13,
} as const;

export const stage = {
  T: 0,
  ready: false,
  reduced: false,
  compact: false,
};

/* ───────────────────────────── math ───────────────────────────── */

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/** ramps 0→1 across [a,b], holds, ramps back to 0 across [c,d] */
export function win(T: number, a: number, b: number, c: number, d: number) {
  return smoothstep(a, b, T) * (1 - smoothstep(c, d, T));
}

/* ─────────────────────── Earth choreography ───────────────────── */

export interface EarthKey {
  /** camera distance in earth radii */
  dist: number;
  /** where the globe sits on screen, in viewport units (-1 … 1) */
  x: number;
  y: number;
  /** extra spin in radians applied on top of the idle rotation */
  spin: number;
  /** how strongly the camera is locked onto Ahmedabad (0 = free spin) */
  lock: number;
  /** atmosphere / rim intensity */
  atmo: number;
}

const EARTH: EarthKey[] = [
  // 0 · hero — the globe sits low and large, headline above it
  { dist: 4.25, x: 0.0, y: -0.62, spin: 0.0, lock: 0, atmo: 1.0 },
  // 1 · problem — drifts right, text takes the left
  { dist: 4.65, x: 0.42, y: -0.06, spin: 0.45, lock: 0, atmo: 1.05 },
  // 2 · metrics — settles left, numbers stack on the right
  { dist: 4.5, x: -0.44, y: -0.02, spin: 0.95, lock: 0.12, atmo: 1.1 },
  // 3 · locate — swings India into view and dives
  { dist: 3.05, x: 0.0, y: 0.0, spin: 1.25, lock: 1, atmo: 1.25 },
  // 4 · handover to the city map
  { dist: 1.95, x: 0.0, y: 0.0, spin: 1.25, lock: 1, atmo: 1.45 },
];

const EARTH_OUTRO: EarthKey[] = [
  // 12 · positioning — the planet returns, far away
  { dist: 5.4, x: 0.0, y: -0.22, spin: 0.2, lock: 0.9, atmo: 0.9 },
  // 13 · final CTA — clean, calm, well below the copy
  { dist: 4.7, x: 0.0, y: -0.78, spin: 0.35, lock: 0.75, atmo: 1.0 },
  { dist: 4.6, x: 0.0, y: -0.84, spin: 0.5, lock: 0.75, atmo: 1.0 },
];

export function earthFor(T: number): EarthKey {
  if (T >= 11.6) {
    const t = clamp((T - 11.6) / 1.4);
    const i = Math.min(EARTH_OUTRO.length - 2, Math.floor(t * (EARTH_OUTRO.length - 1)));
    const f = smoothstep(0, 1, t * (EARTH_OUTRO.length - 1) - i);
    return blend(EARTH_OUTRO[i], EARTH_OUTRO[i + 1], f);
  }
  const i = Math.min(EARTH.length - 2, Math.max(0, Math.floor(T)));
  const f = smoothstep(0, 1, clamp(T - i));
  return blend(EARTH[i], EARTH[i + 1] ?? EARTH[i], f);
}

function blend(a: EarthKey, b: EarthKey, f: number): EarthKey {
  return {
    dist: lerp(a.dist, b.dist, f),
    x: lerp(a.x, b.x, f),
    y: lerp(a.y, b.y, f),
    spin: lerp(a.spin, b.spin, f),
    lock: lerp(a.lock, b.lock, f),
    atmo: lerp(a.atmo, b.atmo, f),
  };
}

/** Intelligence layers that gradually appear on the globe (PRD §6). */
export function earthLayers(T: number) {
  return {
    nodes: win(T, 1.5, 2.2, 4.3, 4.7) + win(T, 12.2, 12.9, 20, 21) * 0.7,
    graticule: win(T, 2.0, 2.7, 4.2, 4.6) + win(T, 12.4, 13.0, 20, 21) * 0.5,
    arcs: win(T, 2.3, 3.0, 4.0, 4.4),
    marker: win(T, 2.6, 3.2, 4.4, 4.8) + win(T, 12.0, 12.7, 20, 21),
    scan: win(T, 3.0, 3.4, 4.2, 4.5),
  };
}

/* ──────────────────────── stage visibility ────────────────────── */

export function stageOpacity(T: number) {
  // Earth owns the opening (0 → 3.8) and the finale (11.9 → end)
  const earth = (1 - smoothstep(3.42, 3.92, T)) + smoothstep(11.75, 12.35, T);
  // the city map takes over through the analytical chapters
  const map = smoothstep(3.5, 3.95, T) * (1 - smoothstep(11.7, 12.2, T));
  return { earth: clamp(earth), map: clamp(map) };
}

/* ──────────────────────── map choreography ────────────────────── */

export interface MapKey {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  /** negative pushes the city left of centre, positive right */
  pad: number;
}

const C = CITY.center;
/** flagship parcel GJ-AHD-1028 — real centroid from the demo dataset */
export const SITE: [number, number] = [72.6236, 23.0742];

export function setSite(coord: [number, number]) {
  SITE[0] = coord[0];
  SITE[1] = coord[1];
}

const MAP: Record<number, MapKey> = {
  3: { center: [C[0], C[1]], zoom: 8.4, bearing: 0, pitch: 0, pad: 0 },
  4: { center: [C[0], C[1]], zoom: 10.35, bearing: -10, pitch: 26, pad: 0.24 },
  5: { center: [C[0] + 0.035, C[1] + 0.004], zoom: 10.7, bearing: 8, pitch: 32, pad: -0.26 },
  6: { center: [C[0] + 0.01, C[1] - 0.008], zoom: 10.15, bearing: 0, pitch: 14, pad: 0.22 },
  7: { center: [C[0] + 0.03, C[1] + 0.03], zoom: 11.5, bearing: 10, pitch: 30, pad: -0.26 },
  8: { center: [0, 0], zoom: 13.4, bearing: 18, pitch: 52, pad: -0.12 },
  9: { center: [0, 0], zoom: 11.3, bearing: 6, pitch: 38, pad: -0.26 },
  10: { center: [C[0] + 0.02, C[1] + 0.01], zoom: 10.6, bearing: -4, pitch: 22, pad: 0.2 },
  11: { center: [C[0], C[1] + 0.01], zoom: 9.3, bearing: 0, pitch: 0, pad: 0 },
  12: { center: [C[0], C[1] + 0.01], zoom: 8.9, bearing: 0, pitch: 0, pad: 0 },
};

function mapKey(i: number): MapKey {
  const k = MAP[Math.min(12, Math.max(3, i))];
  if (k.center[0] === 0) return { ...k, center: [SITE[0], SITE[1]] };
  return k;
}

export function mapFor(T: number, compact: boolean): MapKey {
  const i = Math.min(11, Math.max(3, Math.floor(T)));
  const f = smoothstep(0, 1, clamp(T - i));
  const a = mapKey(i);
  const b = mapKey(i + 1);
  return {
    center: [lerp(a.center[0], b.center[0], f), lerp(a.center[1], b.center[1], f)],
    zoom: lerp(a.zoom, b.zoom, f) - (compact ? 0.8 : 0),
    bearing: lerp(a.bearing, b.bearing, f),
    pitch: lerp(a.pitch, b.pitch, f) * (compact ? 0.5 : 1),
    pad: compact ? 0 : lerp(a.pad, b.pad, f),
  };
}

/* ───────────────────── map layer choreography ─────────────────── */

export interface MapParams {
  graticule: number;
  roads: number;
  wards: number;
  parcels: number;
  basemap: number;
  builtup: number;
  builtupT: number;
  growth: number;
  growthSweep: number;
  corridor: number;
  corridorDraw: number;
  facilities: number;
  coverage: number;
  gap: number;
  filterStage: number;
  candidates: number;
  winner: number;
  catchment: number;
  simFill: number;
  evidence: number;
}

export function mapParams(T: number): MapParams {
  return {
    /* wireframe → glass city (PRD §38) */
    graticule: win(T, 3.55, 3.85, 5.4, 6.0),
    roads: win(T, 3.72, 4.05, 11.6, 12.1),
    wards: win(T, 3.86, 4.18, 11.5, 12.0),
    parcels: win(T, 4.0, 4.35, 11.4, 11.9),
    basemap: win(T, 4.22, 4.75, 11.4, 12.0),

    builtup: win(T, 4.15, 4.5, 5.5, 6.05),
    builtupT: clamp((T - 4.22) / 0.62),

    growth: win(T, 4.95, 5.35, 6.3, 6.8),
    growthSweep: clamp((T - 5.0) / 0.65),

    corridor: win(T, 5.05, 5.45, 7.9, 8.5),
    corridorDraw: clamp((T - 5.1) / 0.55),

    facilities: win(T, 5.95, 6.3, 11.0, 11.5),
    coverage: win(T, 6.05, 6.45, 7.2, 7.7) + win(T, 9.0, 9.4, 10.7, 11.2) * 0.7,
    gap: win(T, 6.15, 6.55, 7.5, 8.0) + win(T, 8.9, 9.3, 10.8, 11.3),

    filterStage: clamp((T - 7.05) / 0.72) * 6,
    candidates: win(T, 7.72, 8.05, 10.6, 11.1),
    winner: win(T, 8.02, 8.35, 10.6, 11.1),

    catchment: clamp((T - 9.08) / 0.6) * win(T, 9.02, 9.3, 10.6, 11.1),
    simFill: clamp((T - 9.12) / 0.58),

    evidence: clamp((T - 10.08) / 0.55),
  };
}
