import type { LngLat, Ward } from "@/types";
import { mulberry32, rngRange } from "@/lib/seeded";
import { ringAreaKm2, ringCentroid } from "@/lib/geo";
import REAL_WARDS from "./real/wards.json";

/**
 * Illustrative/demo data modelled on Ahmedabad ward geography and a
 * GLIS-style schema. NOT an official government, AMC or legal record.
 *
 * 12 planning zones on a jittered lattice (4 cols × 3 rows) spanning the
 * AMC area. Names reference real localities for demo familiarity; the
 * boundaries and populations are synthetic.
 */

const LON_MIN = 72.445;
const LON_MAX = 72.705;
const LAT_MIN = 22.935;
const LAT_MAX = 23.135;
const COLS = 4;
const ROWS = 3;

// Jittered lattice of (COLS+1) x (ROWS+1) shared corner points → contiguous,
// organic-looking ward polygons.
const rng = mulberry32(46012);
const lattice: LngLat[][] = [];
for (let r = 0; r <= ROWS; r++) {
  const row: LngLat[] = [];
  for (let c = 0; c <= COLS; c++) {
    const lon = LON_MIN + (c / COLS) * (LON_MAX - LON_MIN);
    const lat = LAT_MIN + (r / ROWS) * (LAT_MAX - LAT_MIN);
    const edge = c === 0 || c === COLS || r === 0 || r === ROWS;
    const j = edge ? 0.004 : 0.011;
    row.push([lon + rngRange(rng, -j, j), lat + rngRange(rng, -j, j)]);
  }
  lattice.push(row);
}

interface WardSeed {
  id: string;
  name: string;
  col: number;
  row: number;
  pop2018: number;
  pop2026: number;
}

// row 0 = south, row 2 = north; col 0 = west, col 3 = east
const WARD_SEEDS: WardSeed[] = [
  { id: "w-sarkhej", name: "Sarkhej", col: 0, row: 0, pop2018: 468000, pop2026: 596000 },
  { id: "w-vasna", name: "Vasna", col: 1, row: 0, pop2018: 552000, pop2026: 601000 },
  { id: "w-maninagar", name: "Maninagar", col: 2, row: 0, pop2018: 638000, pop2026: 668000 },
  { id: "w-vatva", name: "Vatva", col: 3, row: 0, pop2018: 471000, pop2026: 563000 },
  { id: "w-bopal", name: "Bopal–Ghuma", col: 0, row: 1, pop2018: 214000, pop2026: 452000 },
  { id: "w-navrangpura", name: "Navrangpura", col: 1, row: 1, pop2018: 581000, pop2026: 603000 },
  { id: "w-khadia", name: "Khadia (Old City)", col: 2, row: 1, pop2018: 689000, pop2026: 701000 },
  { id: "w-nikol", name: "Nikol", col: 3, row: 1, pop2018: 377000, pop2026: 521000 },
  { id: "w-gota", name: "Gota", col: 0, row: 2, pop2018: 158000, pop2026: 431000 },
  { id: "w-chandkheda", name: "Chandkheda", col: 1, row: 2, pop2018: 296000, pop2026: 518000 },
  { id: "w-motera", name: "Motera–Sabarmati", col: 2, row: 2, pop2018: 331000, pop2026: 474000 },
  { id: "w-naroda", name: "Naroda", col: 3, row: 2, pop2018: 419000, pop2026: 539000 },
];

function cellRing(col: number, row: number): LngLat[] {
  const p00 = lattice[row][col];
  const p10 = lattice[row][col + 1];
  const p11 = lattice[row + 1][col + 1];
  const p01 = lattice[row + 1][col];
  // midpoints add a vertex per edge for a slightly organic outline
  const mid = (a: LngLat, b: LngLat, bulge: number): LngLat => [
    (a[0] + b[0]) / 2 + rngRange(rng, -bulge, bulge),
    (a[1] + b[1]) / 2 + rngRange(rng, -bulge, bulge),
  ];
  const ring: LngLat[] = [
    p00,
    mid(p00, p10, 0.0),
    p10,
    mid(p10, p11, 0.0),
    p11,
    mid(p11, p01, 0.0),
    p01,
    mid(p01, p00, 0.0),
    p00,
  ];
  return ring;
}

/**
 * Real municipal ward boundaries synced from the spatial engine
 * (`npm run sync:data`). Empty until then, in which case the seeded lattice
 * below is used and the demo still runs with no engine available.
 */
const SEEDED_WARDS: Ward[] = WARD_SEEDS.map((s) => {
  const ring = cellRing(s.col, s.row);
  const pop2022 = Math.round(s.pop2018 + (s.pop2026 - s.pop2018) * 0.55);
  return {
    id: s.id,
    name: s.name,
    ring,
    centroid: ringCentroid(ring),
    areaKm2: ringAreaKm2(ring),
    population: { 2018: s.pop2018, 2022: pop2022, 2026: s.pop2026 },
  };
});

export const WARDS: Ward[] = REAL_WARDS.length ? (REAL_WARDS as Ward[]) : SEEDED_WARDS;
export const USING_REAL_WARDS = REAL_WARDS.length > 0;

export const WARD_BY_ID = new Map(WARDS.map((w) => [w.id, w]));

export function wardForPoint(p: LngLat): Ward {
  // nearest-centroid assignment (fine for demo purposes)
  let best = WARDS[0];
  let bestD = Infinity;
  for (const w of WARDS) {
    const dx = (w.centroid[0] - p[0]) * 102;
    const dy = (w.centroid[1] - p[1]) * 111;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}
