import type { GridCell, LngLat, Year } from "@/types";
import { YEARS } from "@/types";
import { DEFAULT_CITY } from "@/config/city";
import {
  KM_PER_DEG_LAT,
  distKm,
  distToPathKm,
  kmPerDegLng,
  nearestDistKm,
  offsetKm,
  ringAreaKm2,
} from "@/lib/geo";
import { mulberry32, clamp } from "@/lib/seeded";
import { WARDS, wardForPoint } from "./wards";
import { ROADS } from "./roads";
import { FACILITY_COORDS } from "./facilities";
import {
  OBSERVED_BUILT,
  OBSERVED_DLAT,
  OBSERVED_DLON,
  OBSERVED_KM2,
  OBSERVED_LAT_MAX,
  OBSERVED_LAT_MIN,
  OBSERVED_LON_MAX,
  OBSERVED_LON_MIN,
} from "./observed";

/**
 * Analysis grid (~1.1 km cells) + observed built-up extent (Esri land cover,
 * 2018/2022/2024) + 2030 growth probability. Deterministic stand-in for the
 * future PostGIS raster layer. Built-up extent and per-cell density come from
 * real satellite land-cover observation; growth probability remains modelled.
 */

const CENTER = DEFAULT_CITY.growthCenter;

/* ---------------------- Observed built-up extent ---------------------- */

/** (row, col) → { 2018, 2022, 2024 } built fraction, from the satellite pass. */
const OBSERVED_CELLS = new Map<number, Record<Exclude<Year, 2026>, number>>();
for (const [r, c, b18, b22, b24] of OBSERVED_BUILT) {
  OBSERVED_CELLS.set(r * 1000 + c, { 2018: b18, 2022: b22, 2024: b24 });
}

const BUILT_THRESHOLD = 0.2;

function observedCellFor(p: LngLat): Record<Exclude<Year, 2026>, number> | undefined {
  if (
    p[0] < OBSERVED_LON_MIN ||
    p[0] > OBSERVED_LON_MAX ||
    p[1] < OBSERVED_LAT_MIN ||
    p[1] > OBSERVED_LAT_MAX
  ) {
    return undefined;
  }
  const r = Math.floor((p[1] - OBSERVED_LAT_MIN) / OBSERVED_DLAT);
  const c = Math.floor((p[0] - OBSERVED_LON_MIN) / OBSERVED_DLON);
  return OBSERVED_CELLS.get(r * 1000 + c);
}

/** Observed built-up area per satellite epoch (Esri land cover). */
export const BUILTUP_KM2: Record<Exclude<Year, 2026>, number> = {
  2018: OBSERVED_KM2["2018"],
  2022: OBSERVED_KM2["2022"],
  2024: OBSERVED_KM2["2024"],
};

/* ---------------------- Deterministic growth model ---------------------- */

const BASE_RADIUS_KM: Record<Year, number> = { 2018: 7.8, 2022: 8.45, 2024: 9.0, 2026: 9.0 };
/** 2030 model horizon radius used for the prediction surface. */
const RADIUS_2030 = 9.9;

function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * Direction-dependent urban radius. The NW corridor (S.G. Highway / Gota /
 * Chandkheda, θ≈2.35 rad) grows fastest; a smaller eastern industrial bulge
 * (Naroda/Nikol, θ≈0.15) also expands. Angular noise keeps the ring organic
 * but is identical across years so growth reads as coherent expansion.
 */
export function builtupRadiusKm(theta: number, baseKm: number): number {
  const nwAmp = clamp(0.2 * (baseKm - 6.7), 0, 0.62);
  const nw = nwAmp * Math.exp(-Math.pow(angDiff(theta, 2.35), 2) / 0.45);
  const east = 0.18 * Math.exp(-Math.pow(angDiff(theta, 0.15), 2) / 0.5);
  const noise = 1 + 0.1 * Math.sin(3 * theta + 1.7) + 0.07 * Math.sin(7 * theta + 0.4);
  return baseKm * (1 + nw + east) * noise;
}

function ringForRadius(baseKm: number, n = 72): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = builtupRadiusKm(t, baseKm);
    ring.push(offsetKm(CENTER, Math.cos(t) * r, Math.sin(t) * r));
  }
  return ring;
}

/** Fallback extent rings, used only where the observed lattice has no data. */
export const BUILTUP_RINGS: Record<Year, LngLat[]> = {
  2018: ringForRadius(BASE_RADIUS_KM[2018]),
  2022: ringForRadius(BASE_RADIUS_KM[2022]),
  2024: ringForRadius(BASE_RADIUS_KM[2024]),
  2026: ringForRadius(BASE_RADIUS_KM[2026]),
};

/** Angle + radial position of a point relative to the growth centre. */
export function urbanPosition(p: LngLat): { theta: number; rKm: number } {
  const dx = (p[0] - CENTER[0]) * kmPerDegLng(CENTER[1]);
  const dy = (p[1] - CENTER[1]) * KM_PER_DEG_LAT;
  return { theta: Math.atan2(dy, dx), rKm: Math.sqrt(dx * dx + dy * dy) };
}

/**
 * Observed-vector lookup: a point is urbanised in a year if its satellite cell
 * carried ≥ 20% built cover. Outside the observed lattice the deterministic
 * radius model stands in.
 */
export function isUrbanized(p: LngLat, year: Year, jitter = 1): boolean {
  const obs = observedCellFor(p);
  // 2026 remains a parcel/domain year, while satellite observations end in
  // 2024; use the latest observed epoch when the fallback grid is queried.
  const observedYear = year === 2026 ? 2024 : year;
  if (obs) return (obs[observedYear] ?? 0) >= BUILT_THRESHOLD * jitter;
  const { theta, rKm } = urbanPosition(p);
  return rKm < builtupRadiusKm(theta, BASE_RADIUS_KM[year]) * jitter;
}

/* ------------------------------ Grid cells ------------------------------ */

const LON_MIN = 72.445;
const LON_MAX = 72.705;
const LAT_MIN = 22.935;
const LAT_MAX = 23.135;
const DLON = 0.011;
const DLAT = 0.009;

const hospitals = FACILITY_COORDS("hospital");

function buildGrid(): GridCell[] {
  const cells: GridCell[] = [];
  let idx = 0;
  for (let lon = LON_MIN; lon < LON_MAX; lon += DLON) {
    for (let lat = LAT_MIN; lat < LAT_MAX; lat += DLAT) {
      const center: LngLat = [lon + DLON / 2, lat + DLAT / 2];
      const dC = distKm(center, CENTER);
      // elliptical city mask
      const { theta } = urbanPosition(center);
      const inCity =
        Math.pow((Math.cos(theta) * dC) / 14.5, 2) +
          Math.pow((Math.sin(theta) * dC) / 12.0, 2) <
        1;
      const ward = wardForPoint(center);
      const cellRng = mulberry32(1000 + idx * 7);
      // Intra-ward population shape: decay from centre + noise. Normalized
      // per ward below so ward totals match the ward dataset exactly.
      const raw = inCity
        ? Math.exp(-dC / 5.5) * (0.35 + cellRng() * 0.75) + 0.03
        : 0.01 * cellRng();
      const ring: LngLat[] = [
        [lon, lat],
        [lon + DLON, lat],
        [lon + DLON, lat + DLAT],
        [lon, lat + DLAT],
        [lon, lat],
      ];
      cells.push({
        id: `cell-${idx}`,
        center,
        ring,
        population: raw, // normalized below
        wardId: ward.id,
        growthProb: 0, // filled below
        hospitalDistKm: nearestDistKm(center, hospitals),
        inCity,
        built: observedCellFor(center),
      });
      idx++;
    }
  }

  // Normalize population so each ward's cells sum to its 2026 population.
  for (const w of WARDS) {
    const wardCells = cells.filter((c) => c.wardId === w.id);
    const sum = wardCells.reduce((s, c) => s + c.population, 0) || 1;
    for (const c of wardCells) {
      c.population = Math.round((c.population / sum) * w.population[2026]);
    }
  }

  // 2030 growth probability — explainable pseudo-model:
  //   distance to 2026 urban edge + road proximity + ward momentum + centre pull
  for (const c of cells) {
    const { theta, rKm } = urbanPosition(c.center);
    const edge2026 = builtupRadiusKm(theta, BASE_RADIUS_KM[2026]);
    const edge2030 = builtupRadiusKm(theta, RADIUS_2030);
    let p: number;
    if (rKm < edge2026) {
      p = 0.12; // already urbanized
    } else {
      const edgeDist = rKm - edge2026;
      const frontier = Math.exp(-edgeDist / 2.1);
      const roadDist = Math.min(...ROADS.map((r) => distToPathKm(c.center, r.path)));
      const road = 0.3 * Math.exp(-roadDist / 1.6);
      const ward = WARDS.find((w) => w.id === c.wardId)!;
      const momentum =
        0.25 *
        clamp((ward.population[2026] / Math.max(1, ward.population[2018]) - 1) / 1.5, 0, 1);
      const inHorizon = rKm < edge2030 ? 0.12 : 0;
      p = clamp(0.62 * frontier + road + momentum + inHorizon, 0.02, 0.97);
    }
    c.growthProb = c.inCity || p > 0.25 ? p : Math.min(p, 0.2);
  }

  return cells;
}

/**
 * Real analysis grid synced from the spatial engine's population raster
 * (`npm run sync:data`), carrying real population, real growth probability and
 * real distance-to-hospital per cell.
 *
 * This has to move in step with wards, parcels and facilities. A seeded grid
 * measured against real facilities reports everything as already covered, which
 * silently zeroes population-need across every candidate and flattens the
 * simulator's before/after.
 */
export let GRID: GridCell[] = buildGrid();
export let USING_REAL_GRID = false;
export let CITY_CELLS = GRID.filter((c) => c.inCity && c.population > 0);

/** Swap in a study area's real population grid. See lib/dataset.ts. */
export function setGrid(next: GridCell[]) {
  GRID = next;
  USING_REAL_GRID = next.length > 0;
  CITY_CELLS = next.filter((c) => c.inCity && c.population > 0);
}

export function growthClass(p: number): "Very Low" | "Low" | "Medium" | "High" | "Very High" {
  if (p < 0.2) return "Very Low";
  if (p < 0.4) return "Low";
  if (p < 0.6) return "Medium";
  if (p < 0.8) return "High";
  return "Very High";
}
