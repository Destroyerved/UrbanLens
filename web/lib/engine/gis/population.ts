/**
 * Population raster.
 *
 * Population queries ("how many people live within 3 km of this parcel?") are
 * the hottest path in the platform — every parcel enrichment, every ward gap
 * score and every simulation runs them. Intersecting a buffer against real ward
 * polygons is far too slow for that: the digitised municipal boundaries carry
 * hundreds of vertices each, so a per-parcel `turf.intersect` costs milliseconds
 * and the enrichment pass alone would take tens of seconds.
 *
 * Instead the wards are rasterised once into a regular ~250 m population grid
 * (the WorldPop-style representation the PRD asks for in §34 / §72 Slice 3).
 * Queries then become an indexed sum over a small window of cells: O(cells in
 * radius) with no geometry work at all.
 *
 * Population is conserved exactly: each ward's modelled total is redistributed
 * across the cells assigned to it in proportion to cell area, so summing the
 * whole grid returns the city total and summing any ward's cells returns that
 * ward's population.
 */
import type { CityDataset, Ward } from "@/lib/engine/types";

/** Target cell edge in metres. 250 m ≈ 10k cells for Ahmedabad's 441 km². */
const CELL_M = 250;
const M_PER_DEG_LAT = 111_320;
const DEG = Math.PI / 180;
const R_EARTH = 6371;

export interface PopulationGrid {
  minLng: number;
  minLat: number;
  cellLng: number; // degrees
  cellLat: number; // degrees
  cols: number;
  rows: number;
  /** People in each cell (row-major, row * cols + col). */
  pop: Float64Array;
  /** People per km² in each cell. */
  density: Float64Array;
  /** Index into dataset.wards.features, or -1 where no ward covers the cell. */
  wardIdx: Int16Array;
  /** Cell area in km², which varies by row (latitude) only. */
  rowAreaKm2: Float64Array;
  total: number;
  cellCount: number;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLng = (b[0] - a[0]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

/** Ray-casting point-in-polygon over a ring of [lng, lat] pairs. */
function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point in polygon with holes (exterior ring first, then holes). */
function inPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (!inRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (inRing(lng, lat, rings[h])) return false;
  }
  return true;
}

/**
 * A ward's geometry as a list of polygons, each a list of rings. Clipping a
 * taluka against the municipal footprint routinely produces MultiPolygons, and
 * treating one as a Polygon silently loses the whole unit — its cells never
 * match, so its population is dropped from the raster entirely.
 */
function polygonsOf(w: Ward): number[][][][] {
  return w.geometry.type === "Polygon"
    ? [w.geometry.coordinates as number[][][]]
    : (w.geometry.coordinates as number[][][][]);
}

function contains(w: Ward, lng: number, lat: number): boolean {
  for (const rings of polygonsOf(w)) {
    if (inPolygon(lng, lat, rings)) return true;
  }
  return false;
}

function wardBBox(w: Ward): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const rings of polygonsOf(w)) {
    for (const ring of rings) {
      for (const c of ring) {
        if (c[0] < minLng) minLng = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[0] > maxLng) maxLng = c[0];
        if (c[1] > maxLat) maxLat = c[1];
      }
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Builds a fast "which ward contains this point?" lookup: a bbox reject per ward
 * followed by ray casting only for the survivors. Returns the ward index, or -1
 * when the point falls outside every ward (i.e. outside the municipal area).
 */
export function makeWardLocator(wards: Ward[]): (lng: number, lat: number) => number {
  const boxes = wards.map(wardBBox);
  return (lng, lat) => {
    for (let w = 0; w < wards.length; w++) {
      const b = boxes[w];
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      if (contains(wards[w], lng, lat)) return w;
    }
    return -1;
  };
}

function build(dataset: CityDataset): PopulationGrid {
  const wards = dataset.wards.features;
  const boxes = wards.map(wardBBox);

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const b of boxes) {
    if (b[0] < minLng) minLng = b[0];
    if (b[1] < minLat) minLat = b[1];
    if (b[2] > maxLng) maxLng = b[2];
    if (b[3] > maxLat) maxLat = b[3];
  }

  const midLat = (minLat + maxLat) / 2;
  const cellLat = CELL_M / M_PER_DEG_LAT;
  const cellLng = CELL_M / (M_PER_DEG_LAT * Math.cos(midLat * DEG));
  const cols = Math.max(1, Math.ceil((maxLng - minLng) / cellLng));
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / cellLat));
  const n = cols * rows;

  const wardIdx = new Int16Array(n).fill(-1);
  const rowAreaKm2 = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const lat = minLat + (r + 0.5) * cellLat;
    const wM = cellLng * M_PER_DEG_LAT * Math.cos(lat * DEG);
    const hM = cellLat * M_PER_DEG_LAT;
    rowAreaKm2[r] = (wM * hM) / 1e6;
  }

  // Pass 1 — assign each cell to the ward that contains its centre, and
  // accumulate the rasterised area of every ward.
  const wardArea = new Float64Array(wards.length);
  for (let r = 0; r < rows; r++) {
    const lat = minLat + (r + 0.5) * cellLat;
    for (let c = 0; c < cols; c++) {
      const lng = minLng + (c + 0.5) * cellLng;
      for (let w = 0; w < wards.length; w++) {
        const b = boxes[w];
        if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
        if (!contains(wards[w], lng, lat)) continue;
        wardIdx[r * cols + c] = w;
        wardArea[w] += rowAreaKm2[r];
        break;
      }
    }
  }

  // Pass 2 — redistribute each ward's population across its cells by area, so
  // the raster conserves the ward totals exactly despite rasterisation error.
  const pop = new Float64Array(n);
  const density = new Float64Array(n);
  let total = 0;
  let cellCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const w = wardIdx[i];
      if (w < 0) continue;
      const area = wardArea[w];
      if (area <= 0) continue;
      const cellPop = wards[w].properties.population * (rowAreaKm2[r] / area);
      pop[i] = cellPop;
      density[i] = cellPop / rowAreaKm2[r];
      total += cellPop;
      cellCount++;
    }
  }

  return {
    minLng, minLat, cellLng, cellLat, cols, rows,
    pop, density, wardIdx, rowAreaKm2,
    total, cellCount,
  };
}

const g = globalThis as unknown as { __urbanlens_pop__?: Map<string, PopulationGrid> };
const cache: Map<string, PopulationGrid> = g.__urbanlens_pop__ ?? new Map();
g.__urbanlens_pop__ = cache;

export function getPopulationGrid(dataset: CityDataset): PopulationGrid {
  const hit = cache.get(dataset.cityId);
  if (hit) return hit;
  const grid = build(dataset);
  cache.set(dataset.cityId, grid);
  return grid;
}

/** People living within `radiusKm` of a point. */
export function populationWithinKm(
  dataset: CityDataset,
  center: [number, number],
  radiusKm: number
): number {
  const grid = getPopulationGrid(dataset);
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos(center[1] * DEG), 0.01));

  const r0 = Math.max(0, Math.floor((center[1] - dLat - grid.minLat) / grid.cellLat));
  const r1 = Math.min(grid.rows - 1, Math.ceil((center[1] + dLat - grid.minLat) / grid.cellLat));
  const c0 = Math.max(0, Math.floor((center[0] - dLng - grid.minLng) / grid.cellLng));
  const c1 = Math.min(grid.cols - 1, Math.ceil((center[0] + dLng - grid.minLng) / grid.cellLng));

  let sum = 0;
  for (let r = r0; r <= r1; r++) {
    const lat = grid.minLat + (r + 0.5) * grid.cellLat;
    for (let c = c0; c <= c1; c++) {
      const i = r * grid.cols + c;
      if (grid.pop[i] === 0) continue;
      const lng = grid.minLng + (c + 0.5) * grid.cellLng;
      if (haversineKm(center, [lng, lat]) <= radiusKm) sum += grid.pop[i];
    }
  }
  return Math.round(sum);
}

/** Population density (people/km²) at a point, or 0 outside the city. */
export function densityAt(dataset: CityDataset, p: [number, number]): number {
  const grid = getPopulationGrid(dataset);
  const c = Math.floor((p[0] - grid.minLng) / grid.cellLng);
  const r = Math.floor((p[1] - grid.minLat) / grid.cellLat);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return 0;
  return grid.density[r * grid.cols + c];
}

/**
 * Population-weighted sample points inside one unit, for metrics that would
 * otherwise be evaluated at its centroid.
 *
 * A centroid represents a 9 km² city ward well. It represents an 800 km²
 * peri-urban taluka not at all — the centroid of such a unit typically lands in
 * open farmland, so every accessibility score reads as zero regardless of the
 * towns inside it. Sampling where the people actually are fixes that, and makes
 * ward-level scores more faithful too.
 *
 * Cells are picked by descending population so the sample follows settlement
 * rather than area, and each carries its own weight.
 */
export function populationSamples(
  dataset: CityDataset,
  wardIndex: number,
  maxSamples = 12
): { point: [number, number]; weight: number }[] {
  const grid = getPopulationGrid(dataset);
  const cells: { point: [number, number]; weight: number }[] = [];

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const i = r * grid.cols + c;
      if (grid.wardIdx[i] !== wardIndex) continue;
      cells.push({
        point: [grid.minLng + (c + 0.5) * grid.cellLng, grid.minLat + (r + 0.5) * grid.cellLat],
        weight: grid.pop[i],
      });
    }
  }
  if (cells.length <= maxSamples) return cells;

  // Densest cells first, then an even stride across the rest so a large unit is
  // not represented solely by its single biggest town.
  cells.sort((a, b) => b.weight - a.weight);
  const head = cells.slice(0, Math.ceil(maxSamples / 2));
  const rest = cells.slice(head.length);
  const stride = Math.max(1, Math.floor(rest.length / (maxSamples - head.length)));
  const tail: typeof cells = [];
  for (let i = 0; i < rest.length && tail.length < maxSamples - head.length; i += stride) {
    tail.push(rest[i]);
  }
  return [...head, ...tail];
}

export interface PopulationCell {
  lng: number;
  lat: number;
  density: number;
  population: number;
}

/**
 * Populated cells for the density heatmap. `step` samples every Nth cell to keep
 * the payload small — density is preserved, the sample is just coarser.
 */
export function populationCells(dataset: CityDataset, step = 2): PopulationCell[] {
  const grid = getPopulationGrid(dataset);
  const out: PopulationCell[] = [];
  for (let r = 0; r < grid.rows; r += step) {
    const lat = grid.minLat + (r + 0.5) * grid.cellLat;
    for (let c = 0; c < grid.cols; c += step) {
      const i = r * grid.cols + c;
      if (grid.pop[i] === 0) continue;
      out.push({
        lng: Number((grid.minLng + (c + 0.5) * grid.cellLng).toFixed(5)),
        lat: Number(lat.toFixed(5)),
        density: Math.round(grid.density[i]),
        population: Math.round(grid.pop[i]),
      });
    }
  }
  return out;
}
