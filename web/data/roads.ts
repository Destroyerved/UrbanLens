import type { LngLat, Road } from "@/types";
import { offsetKm } from "@/lib/geo";
import { DEFAULT_CITY } from "@/config/city";

/**
 * Illustrative/demo road network modelled on Ahmedabad's arterial structure.
 * NOT survey-accurate — approximated alignments for demo analytics.
 */

function ringPath(center: LngLat, radiusKm: number, n = 48): LngLat[] {
  const path: LngLat[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    path.push(offsetKm(center, Math.cos(t) * radiusKm, Math.sin(t) * radiusKm));
  }
  return path;
}

const SEEDED_ROADS: Road[] = [
  {
    id: "rd-sg",
    name: "S.G. Highway",
    importance: "highway",
    path: [
      [72.503, 22.948],
      [72.51, 22.998],
      [72.515, 23.042],
      [72.52, 23.088],
      [72.527, 23.132],
    ],
  },
  {
    id: "rd-ashram",
    name: "Ashram Road",
    importance: "arterial",
    path: [
      [72.572, 22.958],
      [72.574, 23.002],
      [72.577, 23.048],
      [72.58, 23.092],
    ],
  },
  {
    id: "rd-cg",
    name: "C.G. Road",
    importance: "arterial",
    path: [
      [72.554, 23.012],
      [72.559, 23.03],
      [72.566, 23.045],
    ],
  },
  {
    id: "rd-132ring",
    name: "132 ft Ring Road",
    importance: "major",
    path: ringPath([72.565, 23.024], 5.2),
  },
  {
    id: "rd-spring",
    name: "S.P. Ring Road",
    importance: "highway",
    path: ringPath(DEFAULT_CITY.growthCenter, 11.6),
  },
  {
    id: "rd-naroda",
    name: "Naroda–Dehgam Road",
    importance: "major",
    path: [
      [72.598, 22.99],
      [72.622, 23.028],
      [72.644, 23.068],
      [72.662, 23.102],
    ],
  },
  {
    id: "rd-gota-link",
    name: "Gota–Vaishnodevi Link",
    importance: "major",
    path: [
      [72.496, 23.104],
      [72.52, 23.09],
      [72.535, 23.104],
      [72.552, 23.118],
    ],
  },
  {
    id: "rd-sarkhej",
    name: "Sarkhej–Sanand Road",
    importance: "major",
    path: [
      [72.503, 22.984],
      [72.478, 22.972],
      [72.452, 22.962],
    ],
  },
];

/**
 * Real road network synced from the spatial engine (`npm run sync:data`):
 * OSM motorway/trunk/primary/secondary, rivers excluded. Importance is not
 * carried across, so every synced way renders as an arterial.
 */
export let ROADS: Road[] = SEEDED_ROADS;
export let USING_REAL_ROADS = false;

/** Swap in a study area's real road network. See lib/dataset.ts. */
export function setRoads(next: { id: string; name: string; path: LngLat[] }[]) {
  ROADS = next.map((r) => ({ ...r, importance: "arterial" as const }));
  USING_REAL_ROADS = next.length > 0;
}

