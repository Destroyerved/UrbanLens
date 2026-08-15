import type { LngLat } from "@/types";

/**
 * Lightweight planar geo helpers (equirectangular approximation).
 * Accurate to well under 1% at city scale — a stand-in for PostGIS
 * ST_Distance / ST_Buffer / ST_Area until the backend exists.
 */

export const KM_PER_DEG_LAT = 110.574;

export function kmPerDegLng(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

export function distKm(a: LngLat, b: LngLat): number {
  const midLat = (a[1] + b[1]) / 2;
  const dx = (a[0] - b[0]) * kmPerDegLng(midLat);
  const dy = (a[1] - b[1]) * KM_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from point to segment, km. */
export function distToSegKm(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = kmPerDegLng(p[1]);
  const ky = KM_PER_DEG_LAT;
  const px = p[0] * kx,
    py = p[1] * ky;
  const ax = a[0] * kx,
    ay = a[1] * ky;
  const bx = b[0] * kx,
    by = b[1] * ky;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

export function distToPathKm(p: LngLat, path: LngLat[]): number {
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegKm(p, path[i], path[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

export function nearestDistKm(p: LngLat, points: LngLat[]): number {
  let min = Infinity;
  for (const q of points) {
    const d = distKm(p, q);
    if (d < min) min = d;
  }
  return min;
}

/** Move a point by dx/dy kilometres. */
export function offsetKm(origin: LngLat, dxKm: number, dyKm: number): LngLat {
  return [
    origin[0] + dxKm / kmPerDegLng(origin[1]),
    origin[1] + dyKm / KM_PER_DEG_LAT,
  ];
}

/** Rectangular parcel ring around a centroid. */
export function rectRing(
  center: LngLat,
  areaHa: number,
  aspect: number,
  rotDeg: number
): LngLat[] {
  const areaKm2 = areaHa / 100;
  const w = Math.sqrt(areaKm2 * aspect);
  const h = areaKm2 / w;
  const rot = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rot),
    sin = Math.sin(rot);
  const corners: [number, number][] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  const ring = corners.map(([x, y]) =>
    offsetKm(center, x * cos - y * sin, x * sin + y * cos)
  );
  ring.push(ring[0]);
  return ring;
}

export function circleRing(center: LngLat, radiusKm: number, n = 48): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    ring.push(offsetKm(center, Math.cos(t) * radiusKm, Math.sin(t) * radiusKm));
  }
  return ring;
}

/** Shoelace area of a lng/lat ring, km². */
export function ringAreaKm2(ring: LngLat[]): number {
  const ky = KM_PER_DEG_LAT;
  const kx = kmPerDegLng(ring[0][1]);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(sum / 2);
}

export function ringCentroid(ring: LngLat[]): LngLat {
  let x = 0,
    y = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}
