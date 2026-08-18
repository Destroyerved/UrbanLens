/**
 * The orbital story — camera choreography & interpolation.
 * Continuous shot progression: wide Earth orbit → approach → India → Gujarat → intelligence focus.
 */

export type CamKey = {
  p: number;    // story progress 0..1
  lat: number;  // latitude facing the camera
  lon: number;  // longitude facing the camera
  dist: number; // camera distance from globe centre
  ox: number;   // globe horizontal offset (world units)
  oy: number;   // globe vertical offset
  idle: number; // 0..1 amount of idle self-rotation
};

export const CAMERA_KEYS: CamKey[] = [
  { p: 0.0,  lat: 10,   lon: -20,  dist: 3.55, ox: 0.85, oy: 0.05,  idle: 1 },
  { p: 0.2,  lat: 12,   lon: 8,    dist: 3.3,  ox: 0.72, oy: 0.02,  idle: 0.55 },
  { p: 0.42, lat: 18,   lon: 52,   dist: 2.85, ox: 0.45, oy: 0.0,   idle: 0.12 },
  { p: 0.56, lat: 21,   lon: 76,   dist: 2.45, ox: 0.22, oy: -0.05, idle: 0 },
  { p: 0.74, lat: 22.6, lon: 71.6, dist: 2.08, ox: 0.0,  oy: -0.14, idle: 0 },
  { p: 0.9,  lat: 22.8, lon: 71.6, dist: 1.98, ox: 0.0,  oy: -0.16, idle: 0 },
  { p: 1.0,  lat: 24.5, lon: 71.6, dist: 2.1,  ox: 0.0,  oy: -0.55, idle: 0 },
];

export function evalCamera(p: number) {
  const ks = CAMERA_KEYS;
  if (p <= ks[0].p) return { ...ks[0] };
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (p <= b.p) {
      const t = (p - a.p) / (b.p - a.p);
      const s = t * t * (3 - 2 * t); // smoothstep between keys
      const L = (x: number, y: number) => x + (y - x) * s;
      return {
        lat: L(a.lat, b.lat),
        lon: L(a.lon, b.lon),
        dist: L(a.dist, b.dist),
        ox: L(a.ox, b.ox),
        oy: L(a.oy, b.oy),
        idle: L(a.idle, b.idle),
      };
    }
  }
  const last = ks[ks.length - 1];
  return { ...last };
}

export type Scene = {
  id: string;
  pos: "left" | "bottom";
  eyebrow: string;
  lines: string[];
  sub: string;
  in: [number, number] | null;
  out: [number, number];
};

export const SCENES: Scene[] = [
  {
    id: "s1",
    pos: "left",
    eyebrow: "URBANLENS · EARTH INTELLIGENCE",
    lines: ["Seeing cities", "before they exist."],
    sub: "Planetary-scale land and urban intelligence — from orbit down to the parcel.",
    in: null,
    out: [0.1, 0.16],
  },
  {
    id: "s2",
    pos: "left",
    eyebrow: "01 — LAND",
    lines: ["Every city", "begins as land."],
    sub: "Where a city grows is the hardest, most permanent decision in planning.",
    in: [0.18, 0.24],
    out: [0.34, 0.4],
  },
  {
    id: "s3",
    pos: "left",
    eyebrow: "02 — INDIA",
    lines: ["India is urbanizing faster", "than any nation in history."],
    sub: "400 million new urban residents by 2050. Every corridor matters.",
    in: [0.44, 0.5],
    out: [0.6, 0.65],
  },
  {
    id: "s4",
    pos: "bottom",
    eyebrow: "03 — GUJARAT",
    lines: ["Gujarat is where", "it accelerates."],
    sub: "Ahmedabad · Gandhinagar · Surat · Vadodara · Rajkot — one connected growth engine.",
    in: [0.68, 0.74],
    out: [0.82, 0.86],
  },
  {
    id: "s5",
    pos: "left",
    eyebrow: "04 — INTELLIGENCE",
    lines: ["See growth", "before it happens."],
    sub: "UrbanLens reads land, infrastructure and expansion patterns from orbit.",
    in: [0.87, 0.92],
    out: [0.965, 1.0],
  },
];
