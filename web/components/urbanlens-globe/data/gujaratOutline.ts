/**
 * Simplified Gujarat state boundary, traced clockwise in WGS84 degrees.
 *
 * This is a low-vertex cartographic simplification intended for a subtle glow
 * outline at globe scale — Kutch, the Gulf of Kutch, the Saurashtra peninsula,
 * the Gulf of Khambhat and the mainland all read correctly. It is NOT a survey
 * boundary and must not be used for measurement or any official purpose.
 */

export const GUJARAT_OUTLINE: [number, number][] = [
  // ── northern Kutch / Rann, west → east ─────────────────────────────
  [68.45, 23.92],
  [68.78, 24.18],
  [69.35, 24.28],
  [70.05, 24.32],
  [70.62, 24.42],
  [71.12, 24.66],
  [71.68, 24.62],
  [72.24, 24.6],
  // ── north-east border with Rajasthan ───────────────────────────────
  [72.78, 24.42],
  [73.32, 24.36],
  [73.72, 23.98],
  [74.12, 23.6],
  // ── eastern border with Madhya Pradesh ─────────────────────────────
  [74.42, 23.02],
  [74.38, 22.56],
  [74.06, 22.02],
  // ── south-east border with Maharashtra ─────────────────────────────
  [73.88, 21.48],
  [73.58, 21.02],
  [73.22, 20.52],
  [72.98, 20.18],
  // ── southern tip, then north along the mainland coast ──────────────
  [72.86, 20.1],
  [72.72, 20.42],
  [72.9, 20.88],
  [72.76, 21.16],
  [72.62, 21.44],
  [72.66, 21.72],
  [72.55, 21.96],
  [72.56, 22.2],
  [72.62, 22.32],
  // ── Gulf of Khambhat, down the Saurashtra east coast ───────────────
  [72.24, 22.16],
  [72.16, 21.9],
  [72.1, 21.74],
  [71.94, 21.5],
  [71.58, 21.12],
  [71.18, 20.92],
  [70.86, 20.76],
  [70.46, 20.74],
  [70.06, 20.76],
  // ── south-west Saurashtra coast, north to Dwarka ───────────────────
  [69.78, 21.06],
  [69.6, 21.5],
  [69.28, 21.92],
  [69.05, 22.2],
  [68.95, 22.46],
  // ── Gulf of Kutch, south shore heading east ────────────────────────
  [69.42, 22.56],
  [69.92, 22.46],
  [70.4, 22.6],
  [70.88, 22.76],
  [71.14, 22.9],
  // ── Little Rann, back west along the Kutch south coast ─────────────
  [71.1, 23.22],
  [70.86, 23.48],
  [70.55, 23.32],
  [70.12, 22.98],
  [69.68, 22.86],
  [69.34, 22.84],
  [68.96, 23.08],
  [68.62, 23.44],
  [68.42, 23.64],
  [68.45, 23.92],
];

/** Rough bounding box, handy for framing. */
export const GUJARAT_BOUNDS = {
  minLng: 68.42,
  maxLng: 74.42,
  minLat: 20.1,
  maxLat: 24.66,
};
