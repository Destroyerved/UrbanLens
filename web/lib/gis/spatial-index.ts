/**
 * Uniform-grid nearest-neighbour index for point sets.
 *
 * Nearest-facility and distance-to-road are the two innermost loops of parcel
 * enrichment. Scanned linearly they cost O(n) per query — with ~30k road
 * vertices and ~1,800 parcels that is tens of millions of haversines and made
 * the first request take several seconds.
 *
 * Bucketing the points into a ~1 km grid turns each query into a search over
 * expanding rings of cells, which terminates as soon as the next ring cannot
 * possibly contain anything closer than the best candidate found so far.
 */

const DEG = Math.PI / 180;
const R_EARTH = 6371;
const KM_PER_DEG_LAT = 110.574;

function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLng = (b[0] - a[0]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

export interface PointIndex<T> {
  items: T[];
  coords: [number, number][];
  minLng: number;
  minLat: number;
  cellLng: number;
  cellLat: number;
  cols: number;
  rows: number;
  /** Item indices per cell, row-major; undefined where empty. */
  cells: (number[] | undefined)[];
  /** Smallest real-world edge length of a cell, in km (used to bound the search). */
  cellKm: number;
}

export function buildPointIndex<T>(
  items: T[],
  getCoord: (t: T) => [number, number],
  cellKm = 1
): PointIndex<T> {
  const coords = items.map(getCoord);

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!coords.length) {
    minLng = minLat = maxLng = maxLat = 0;
  }

  const midLat = (minLat + maxLat) / 2;
  const cellLat = cellKm / KM_PER_DEG_LAT;
  const cellLng = cellKm / (KM_PER_DEG_LAT * Math.max(Math.cos(midLat * DEG), 0.01));
  const cols = Math.max(1, Math.ceil((maxLng - minLng) / cellLng) + 1);
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / cellLat) + 1);

  const cells: (number[] | undefined)[] = new Array(cols * rows);
  for (let i = 0; i < coords.length; i++) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor((coords[i][0] - minLng) / cellLng)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((coords[i][1] - minLat) / cellLat)));
    const k = r * cols + c;
    (cells[k] ??= []).push(i);
  }

  return { items, coords, minLng, minLat, cellLng, cellLat, cols, rows, cells, cellKm };
}

/**
 * Nearest indexed point to `p`. Rings expand outward from the query cell; the
 * search stops once the closest possible point in the next ring is farther than
 * the best match already found.
 */
export function nearestInIndex<T>(
  idx: PointIndex<T>,
  p: [number, number]
): { item: T | null; km: number } {
  if (!idx.items.length) return { item: null, km: Infinity };

  const c0 = Math.floor((p[0] - idx.minLng) / idx.cellLng);
  const r0 = Math.floor((p[1] - idx.minLat) / idx.cellLat);

  let best = -1;
  let bestKm = Infinity;
  const maxRing = Math.max(idx.cols, idx.rows);

  for (let ring = 0; ring <= maxRing; ring++) {
    // Everything in this ring is at least (ring - 1) cells away, so once that
    // lower bound exceeds the current best there is nothing left to find.
    if (best >= 0 && (ring - 1) * idx.cellKm > bestKm) break;

    const rLo = r0 - ring;
    const rHi = r0 + ring;
    const cLo = c0 - ring;
    const cHi = c0 + ring;
    let touched = false;

    for (let r = rLo; r <= rHi; r++) {
      if (r < 0 || r >= idx.rows) continue;
      const edgeRow = r === rLo || r === rHi;
      for (let c = cLo; c <= cHi; c++) {
        if (c < 0 || c >= idx.cols) continue;
        // Only the perimeter of the ring is new.
        if (!edgeRow && c !== cLo && c !== cHi) continue;
        touched = true;
        const bucket = idx.cells[r * idx.cols + c];
        if (!bucket) continue;
        for (const i of bucket) {
          const d = haversineKm(p, idx.coords[i]);
          if (d < bestKm) {
            bestKm = d;
            best = i;
          }
        }
      }
    }
    // Ring fell entirely outside the grid and we already have a hit — done.
    if (!touched && best >= 0) break;
  }

  return { item: best >= 0 ? idx.items[best] : null, km: bestKm };
}

/** Indexed points within `radiusKm` of `p`. */
export function withinRadius<T>(idx: PointIndex<T>, p: [number, number], radiusKm: number): T[] {
  const out: T[] = [];
  if (!idx.items.length) return out;

  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.max(Math.cos(p[1] * DEG), 0.01));
  const c0 = Math.max(0, Math.floor((p[0] - dLng - idx.minLng) / idx.cellLng));
  const c1 = Math.min(idx.cols - 1, Math.ceil((p[0] + dLng - idx.minLng) / idx.cellLng));
  const r0 = Math.max(0, Math.floor((p[1] - dLat - idx.minLat) / idx.cellLat));
  const r1 = Math.min(idx.rows - 1, Math.ceil((p[1] + dLat - idx.minLat) / idx.cellLat));

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const bucket = idx.cells[r * idx.cols + c];
      if (!bucket) continue;
      for (const i of bucket) {
        if (haversineKm(p, idx.coords[i]) <= radiusKm) out.push(idx.items[i]);
      }
    }
  }
  return out;
}
