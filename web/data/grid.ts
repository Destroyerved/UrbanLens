import type { GridCell, LngLat, Year } from "@/types";
import { YEARS } from "@/types";
import { ACTIVE_CITY } from "@/config/city";
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

/**
 * Analysis grid (~1.1 km cells) + historical built-up extents + 2030 growth
 * probability. Deterministic stand-in for the future PostGIS raster layer and
 * XGBoost growth model. Illustrative/demo data modelled on Ahmedabad —
 * NOT an official record.
 */

const CENTER = ACTIVE_CITY.growthCenter;

/* ---------------------- Historical built-up extent ---------------------- */

const BASE_RADIUS_KM: Record<Year, number> = { 2018: 7.8, 2022: 8.45, 2026: 9.0 };
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
  // NW corridor amplitude grows with the base year radius → the corridor
  // visibly "explodes" north-west between 2018 and 2026/2030.
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

export const BUILTUP_RINGS: Record<Year, LngLat[]> = {
  2018: ringForRadius(BASE_RADIUS_KM[2018]),
  2022: ringForRadius(BASE_RADIUS_KM[2022]),
  2026: ringForRadius(BASE_RADIUS_KM[2026]),
};

export const BUILTUP_KM2: Record<Year, number> = {
  2018: Math.round(ringAreaKm2(BUILTUP_RINGS[2018])),
  2022: Math.round(ringAreaKm2(BUILTUP_RINGS[2022])),
  2026: Math.round(ringAreaKm2(BUILTUP_RINGS[2026])),
};

/** Angle + radial position of a point relative to the growth centre. */
export function urbanPosition(p: LngLat): { theta: number; rKm: number } {
  const dx = (p[0] - CENTER[0]) * kmPerDegLng(CENTER[1]);
  const dy = (p[1] - CENTER[1]) * KM_PER_DEG_LAT;
  return { theta: Math.atan2(dy, dx), rKm: Math.sqrt(dx * dx + dy * dy) };
}

export function isUrbanized(p: LngLat, year: Year, jitter = 1): boolean {
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

export const GRID: GridCell[] = buildGrid();

export const CITY_CELLS = GRID.filter((c) => c.inCity && c.population > 0);

export function growthClass(p: number): "Very Low" | "Low" | "Medium" | "High" | "Very High" {
  if (p < 0.2) return "Very Low";
  if (p < 0.4) return "Low";
  if (p < 0.6) return "Medium";
  if (p < 0.8) return "High";
  return "Very High";
}
