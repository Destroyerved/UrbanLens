/**
 * GeoJSON for the city chapters, built from the app's own demo datasets
 * (`@/data/*`) — the same parcels, wards, roads, facilities and population grid
 * the dashboard renders. Nothing here is invented for the landing page.
 */

import type { FeatureCollection, Feature, Geometry } from "geojson";
import { PARCELS, PARCEL_BY_ID, FLAGSHIP_PARCEL_ID } from "@/data/parcels";
import { WARDS } from "@/data/wards";
import { ROADS } from "@/data/roads";
import { FACILITIES } from "@/data/facilities";
import { GRID, isUrbanized } from "@/data/grid";
import { circleRing, distKm } from "@/lib/geo";
import type { LngLat, Year } from "@/types";

type FC = FeatureCollection<Geometry, Record<string, unknown>>;

const fc = (features: Feature<Geometry, Record<string, unknown>>[]): FC => ({
  type: "FeatureCollection",
  features,
});

const poly = (ring: LngLat[], properties: Record<string, unknown>) =>
  ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties,
  }) as Feature<Geometry, Record<string, unknown>>;

const line = (path: LngLat[], properties: Record<string, unknown>) =>
  ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: path },
    properties,
  }) as Feature<Geometry, Record<string, unknown>>;

const point = (coord: LngLat, properties: Record<string, unknown>) =>
  ({
    type: "Feature",
    geometry: { type: "Point", coordinates: coord },
    properties,
  }) as Feature<Geometry, Record<string, unknown>>;

export const FLAGSHIP = PARCEL_BY_ID.get(FLAGSHIP_PARCEL_ID) ?? PARCELS[0];

/* ── the six site filters, applied in order (PRD §16, §23) ─────────── */

export const FILTER_TESTS = [
  { key: "gov", test: (p: (typeof PARCELS)[number]) => p.ownership === "government" },
  { key: "area", test: (p: (typeof PARCELS)[number]) => p.areaHa >= 4 },
  { key: "road", test: (p: (typeof PARCELS)[number]) => p.roadDistKm <= 2.5 },
  { key: "need", test: (p: (typeof PARCELS)[number]) => p.population3km >= 45000 },
  { key: "flood", test: (p: (typeof PARCELS)[number]) => p.floodRisk === "low" },
  {
    key: "env",
    test: (p: (typeof PARCELS)[number]) => p.envSensitivity <= 60 && p.builtUpPct <= 40,
  },
] as const;

/** How many parcels survive after each successive filter. Computed, not typed. */
export function filterCounts() {
  const counts: number[] = [PARCELS.length];
  let pool = PARCELS.slice();
  for (const f of FILTER_TESTS) {
    pool = pool.filter(f.test);
    counts.push(pool.length);
  }
  return { counts, survivors: pool };
}

/** Stage (1–6) at which a parcel drops out; 9 = survives every filter. */
function elimStage(p: (typeof PARCELS)[number]) {
  for (let i = 0; i < FILTER_TESTS.length; i++) {
    if (!FILTER_TESTS[i].test(p)) return i + 1;
  }
  return 9;
}

export const parcelsFC = fc(
  PARCELS.map((p) =>
    poly(p.ring, {
      id: p.id,
      gov: p.ownership === "government" ? 1 : 0,
      elim: elimStage(p),
      flagship: p.id === FLAGSHIP.id ? 1 : 0,
    })
  )
);

const survivors = filterCounts().survivors;
const ranked = survivors
  .slice()
  .sort((a, b) => b.developmentPotential - a.developmentPotential)
  .slice(0, 3);

/** Ranked candidates — flagship first so the story matches the PRD scenario. */
export const candidatesFC = fc(
  [FLAGSHIP, ...ranked.filter((p) => p.id !== FLAGSHIP.id)]
    .slice(0, 3)
    .map((p, i) => poly(p.ring, { id: p.id, rank: i + 1 }))
);

export const winnerHaloFC = fc([
  poly(circleRing(FLAGSHIP.centroid, 0.85, 48), { kind: "halo" }),
]);

export const wardsFC = fc(
  WARDS.map((w) => poly(w.ring, { name: w.name, pop: w.population[2026] }))
);

export const roadsFC = fc(
  ROADS.map((r) => line(r.path, { name: r.name }))
);

export const hospitalsFC = fc(
  FACILITIES.filter((f) => f.type === "hospital" || f.type === "clinic").map((f) =>
    point(f.coord, { name: f.name, kind: f.type })
  )
);

const HOSPITAL_COORDS = FACILITIES.filter((f) => f.type === "hospital").map((f) => f.coord);

export const coverageFC = fc(
  HOSPITAL_COORDS.map((c, i) => poly(circleRing(c, 3.5, 40), { i }))
);

/* ── population grid: deficit + simulation fill ────────────────────── */

const maxPop = Math.max(...GRID.map((c) => c.population));

export const gridFC = fc(
  GRID.filter((c) => c.inCity).map((c) => {
    const gap = Math.max(0, Math.min(1, (c.hospitalDistKm - 3.5) / 4));
    const dSite = distKm(c.center, FLAGSHIP.centroid);
    return poly(c.ring, {
      gap: Number(gap.toFixed(3)),
      dens: Number((c.population / maxPop).toFixed(3)),
      growth: Number(c.growthProb.toFixed(3)),
      // sweep order for the prediction reveal: south → north
      o: Number(Math.min(1, Math.max(0, (c.center[1] - 22.92) / 0.26)).toFixed(3)),
      ds: Number(Math.min(1, dSite / 3.5).toFixed(3)),
      newly: gap > 0.02 && dSite <= 3.5 ? 1 : 0,
    });
  })
);

/** Built-up expansion 2018 → 2024, from the observed satellite land cover. */
export const builtUpFC = fc(
  GRID.filter((c) => isUrbanized(c.center, 2024 as Year)).map((c) => {
    const t = isUrbanized(c.center, 2018 as Year)
      ? 0
      : isUrbanized(c.center, 2022 as Year)
        ? 0.5
        : 1;
    return poly(c.ring, { t });
  })
);

/* ── growth corridor: city centre → flagship parcel, extended ──────── */

const CENTRE: LngLat = [72.571, 23.026];
const dir: LngLat = [FLAGSHIP.centroid[0] - CENTRE[0], FLAGSHIP.centroid[1] - CENTRE[1]];

export const corridorFC = fc([
  line(
    [
      [CENTRE[0] + dir[0] * 0.15, CENTRE[1] + dir[1] * 0.15 - 0.045],
      [CENTRE[0] + dir[0] * 0.7, CENTRE[1] + dir[1] * 0.7 - 0.02],
      [FLAGSHIP.centroid[0], FLAGSHIP.centroid[1]],
      [CENTRE[0] + dir[0] * 1.7, CENTRE[1] + dir[1] * 1.7 + 0.02],
      [CENTRE[0] + dir[0] * 2.4, CENTRE[1] + dir[1] * 2.4 + 0.05],
    ],
    { name: "Eastern Industrial Corridor" }
  ),
]);

/* ── simulation catchment rings ────────────────────────────────────── */

export const ringsFC = fc(
  Array.from({ length: 20 }, (_, i) => {
    const rn = (i + 1) / 20;
    return poly(circleRing(FLAGSHIP.centroid, rn * 3.5, 44), { rn });
  })
);

export const proposedFC = fc([point(FLAGSHIP.centroid, { id: FLAGSHIP.id })]);

/* ── a technical graticule for the wireframe opening ───────────────── */

export const graticuleFC = fc(
  (() => {
    const feats: Feature<Geometry, Record<string, unknown>>[] = [];
    const step = 0.02;
    for (let lng = 72.36; lng <= 72.8; lng += step) {
      feats.push(line([[lng, 22.86], [lng, 23.24]], {}));
    }
    for (let lat = 22.86; lat <= 23.24; lat += step) {
      feats.push(line([[72.36, lat], [72.8, lat]], {}));
    }
    return feats;
  })()
);

export const CITY_STATS = {
  parcels: PARCELS.length,
  wards: WARDS.length,
  facilities: FACILITIES.length,
  cells: GRID.length,
};
