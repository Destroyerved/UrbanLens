import type { LandUse, LngLat, Parcel, RiskLevel, Year } from "@/types";
import { mulberry32, rngInt, rngPick, rngRange, clamp, type Rng } from "@/lib/seeded";
import { distToPathKm, nearestDistKm, rectRing } from "@/lib/geo";
import { WARDS, wardForPoint } from "./wards";
import { ROADS } from "./roads";
import { FACILITY_COORDS } from "./facilities";
import { CITY_CELLS, isUrbanized } from "./grid";
import { distKm } from "@/lib/geo";

/**
 * Illustrative/demo GLIS-style parcel dataset modelled on Ahmedabad.
 * NOT an official government, GLIS, AnyRoR or legal record.
 *
 * Every attribute is derived deterministically (seeded PRNG + spatial
 * formulas), so scores and rankings are reproducible run-to-run.
 */

const hospitalCoords = FACILITY_COORDS("hospital");
const schoolCoords = FACILITY_COORDS("school");
const parkCoords = FACILITY_COORDS("park");
const transitCoords = FACILITY_COORDS("transit");

const RIVER_LON_AT = (lat: number) => 72.575 + (lat - 23.02) * 0.05;

function floodRiskFor(p: LngLat, rng: Rng): RiskLevel {
  const d = Math.abs(p[0] - RIVER_LON_AT(p[1]));
  if (d < 0.008) return "high";
  if (d < 0.02) return "medium";
  if (p[0] > 72.645 && rng() < 0.22) return "medium"; // eastern low-lying pockets
  return "low";
}

function pop3km(p: LngLat): number {
  let sum = 0;
  for (const c of CITY_CELLS) {
    if (distKm(p, c.center) <= 3) sum += c.population;
  }
  return sum;
}

function roadDistKm(p: LngLat): number {
  return Math.min(...ROADS.map((r) => distToPathKm(p, r.path)));
}

interface DerivedDistances {
  roadDistKm: number;
  hospitalDistKm: number;
  schoolDistKm: number;
  parkDistKm: number;
  transitDistKm: number;
  population3km: number;
}

function derive(p: LngLat): DerivedDistances {
  return {
    roadDistKm: round2(roadDistKm(p)),
    hospitalDistKm: round2(nearestDistKm(p, hospitalCoords)),
    schoolDistKm: round2(nearestDistKm(p, schoolCoords)),
    parkDistKm: round2(nearestDistKm(p, parkCoords)),
    transitDistKm: round2(nearestDistKm(p, transitCoords)),
    population3km: pop3km(p),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const URBAN_USES: LandUse[] = ["residential", "residential", "mixed", "commercial"];
const EAST_URBAN_USES: LandUse[] = ["industrial", "industrial", "residential", "mixed"];
const RURAL_USES: LandUse[] = [
  "agriculture",
  "agriculture",
  "agriculture",
  "vacant",
  "vacant",
  "vegetation",
];

function landUseHistory(
  centroid: LngLat,
  rng: Rng
): { byYear: Record<Year, LandUse>; urbanUse: LandUse; ruralUse: LandUse } {
  const east = centroid[0] > 72.615;
  const urbanUse = rngPick(rng, east ? EAST_URBAN_USES : URBAN_USES);
  const ruralUse = rngPick(rng, RURAL_USES);
  const jitter = rngRange(rng, 0.85, 1.15);
  const byYear = {} as Record<Year, LandUse>;
  ([2018, 2022, 2024, 2026] as Year[]).forEach((y) => {
    byYear[y] = isUrbanized(centroid, y, jitter) ? urbanUse : ruralUse;
  });
  return { byYear, urbanUse, ruralUse };
}

/** Seeded stand-in for the engine's development-potential score, used only when
 *  no real parcel layer has been synced. */
/** Seeded stand-in for the engine's zoning rule (agricultural land built up). */
function seededConflict(zoning: string, landUse: string, builtUpPct: number): boolean {
  return (
    (zoning === "agriculture" && builtUpPct > 40) ||
    (zoning === "residential" && landUse === "industrial")
  );
}

function seededPotential(isGovt: boolean, infraReadiness: number, builtUpPct: number, areaHa: number): number {
  return Math.round(
    Math.min(98, (isGovt ? 28 : 14) + infraReadiness * 0.4 + (100 - builtUpPct) * 0.25 + Math.min(10, areaHa * 1.5)),
  );
}

function buildParcels(): Parcel[] {
  const rng = mulberry32(20260814);
  const parcels: Parcel[] = [];
  const usedIds = new Set<number>([1028, 3882, 8291]);

  for (const ward of WARDS) {
    const count = 11;
    for (let i = 0; i < count; i++) {
      let idNum = rngInt(rng, 1000, 9899);
      while (usedIds.has(idNum)) idNum = rngInt(rng, 1000, 9899);
      usedIds.add(idNum);

      const centroid: LngLat = [
        ward.centroid[0] + rngRange(rng, -0.026, 0.026),
        ward.centroid[1] + rngRange(rng, -0.024, 0.024),
      ];
      const areaHa = round2(rngRange(rng, 0.8, 8.2));
      const { byYear } = landUseHistory(centroid, rng);
      const landUse = byYear[2026];
      const urbanizedBy2018 = byYear[2018] === byYear[2026] && isUrbanized(centroid, 2018, 1);
      // Official zoning lags reality: parcels urbanized after 2018 often keep
      // their old designation → natural zoning conflicts for the demo.
      const zoning: LandUse = urbanizedBy2018
        ? landUse
        : rng() < 0.68
          ? byYear[2018]
          : landUse;

      const isBuilt = ["residential", "commercial", "industrial", "mixed", "public"].includes(landUse);
      const builtUpPct = isBuilt
        ? rngInt(rng, 45, 92)
        : landUse === "vacant"
          ? rngInt(rng, 2, 12)
          : rngInt(rng, 0, 7);
      const vegetationPct =
        landUse === "vegetation"
          ? rngInt(rng, 55, 90)
          : landUse === "agriculture"
            ? rngInt(rng, 25, 55)
            : rngInt(rng, 2, 18);

      const d = derive(centroid);
      const floodRisk = floodRiskFor(centroid, rng);
      const envSensitivity =
        landUse === "vegetation"
          ? rngInt(rng, 55, 85)
          : landUse === "water"
            ? 95
            : landUse === "agriculture"
              ? rngInt(rng, 25, 45)
              : rngInt(rng, 8, 26);
      const infraReadiness = Math.round(
        clamp(88 - d.roadDistKm * 16 + rngRange(rng, -10, 6) + (isBuilt ? 8 : 0), 15, 82)
      );

      const ownership = rng() < 0.26 || landUse === "public" ? "government" : "private";

      parcels.push({
        id: `GJ-AHD-${idNum}`,
        surveyNumber: `SN-${rngInt(rng, 100, 999)}/${rngInt(rng, 1, 9)}`,
        wardId: wardForPoint(centroid).id,
        centroid,
        ring: rectRing(centroid, areaHa, rngRange(rng, 0.6, 1.8), rngRange(rng, -30, 30)),
        areaHa,
        ownership,
        zoning,
        landUse,
        landUseByYear: byYear,
        builtUpPct,
        vegetationPct,
        ...d,
        floodRisk,
        infraReadiness,
        envSensitivity,
        developmentPotential: seededPotential(ownership === "government", infraReadiness, builtUpPct, areaHa),
        zoningConflict: seededConflict(zoning, landUse, builtUpPct),
      });
    }
  }

  // ---- Flagship demo parcels (seeded so the intended NW-corridor story
  // emerges naturally from the same scoring formulas — no hardcoded scores).
  const flagship = (
    idNum: number,
    centroid: LngLat,
    areaHa: number,
    opts: {
      zoning: LandUse;
      landUse: LandUse;
      byYear: Record<Year, LandUse>;
      floodRisk: RiskLevel;
      infraReadiness: number;
      envSensitivity: number;
      vegetationPct: number;
    }
  ): Parcel => {
    const d = derive(centroid);
    return {
      id: `GJ-AHD-${idNum}`,
      surveyNumber: `SN-${idNum % 900}/2`,
      wardId: wardForPoint(centroid).id,
      centroid,
      ring: rectRing(centroid, areaHa, 1.35, 12),
      areaHa,
      ownership: "government",
      zoning: opts.zoning,
      landUse: opts.landUse,
      landUseByYear: opts.byYear,
      builtUpPct: opts.landUse === "vacant" ? 4 : 2,
      vegetationPct: opts.vegetationPct,
      ...d,
      floodRisk: opts.floodRisk,
      infraReadiness: opts.infraReadiness,
      envSensitivity: opts.envSensitivity,
      developmentPotential: seededPotential(
        true,
        opts.infraReadiness,
        opts.landUse === "vacant" ? 4 : 2,
        areaHa,
      ),
      zoningConflict: seededConflict(
        opts.zoning,
        opts.landUse,
        opts.landUse === "vacant" ? 4 : 2,
      ),
    };
  };

  parcels.push(
    flagship(1028, [72.503, 23.107], 5.2, {
      zoning: "public",
      landUse: "vacant",
      byYear: { 2018: "agriculture", 2022: "vacant", 2024: "vacant", 2026: "vacant" },
      floodRisk: "low",
      infraReadiness: 92,
      envSensitivity: 8,
      vegetationPct: 9,
    }),
    flagship(3882, [72.556, 23.108], 4.6, {
      zoning: "residential",
      landUse: "vacant",
      byYear: { 2018: "agriculture", 2022: "agriculture", 2024: "vacant", 2026: "vacant" },
      floodRisk: "medium", // Sabarmati floodplain fringe
      infraReadiness: 58,
      envSensitivity: 34,
      vegetationPct: 14,
    }),
    flagship(8291, [72.487, 23.005], 6.1, {
      zoning: "agriculture",
      landUse: "agriculture",
      byYear: { 2018: "agriculture", 2022: "agriculture", 2024: "agriculture", 2026: "agriculture" },
      floodRisk: "low",
      infraReadiness: 70,
      envSensitivity: 20,
      vegetationPct: 32,
    })
  );

  return parcels;
}

/**
 * Real land parcels synced from the spatial engine (`npm run sync:data`):
 * mapped OpenStreetMap land boundaries carrying their real land-use tag. Falls
 * back to the seeded generator when no sync has been run.
 */
export let PARCELS: Parcel[] = buildParcels();
export let USING_REAL_PARCELS = false;
export let PARCEL_BY_ID = new Map(PARCELS.map((p) => [p.id, p]));

/**
 * The parcel the demo opens on. With seeded data this is the scripted flagship;
 * with real data that id does not exist, so the strongest government parcel of
 * a workable size stands in for it.
 */
export let FLAGSHIP_PARCEL_ID: string = "GJ-AHD-1028";

function pickFlagship(): string {
  if (!USING_REAL_PARCELS) return "GJ-AHD-1028";
  const best = PARCELS.filter((p) => p.ownership === "government" && p.areaHa >= 2).sort(
    (a, b) => b.infraReadiness - a.infraReadiness,
  )[0];
  return best?.id ?? PARCELS[0]?.id ?? "";
}

/** Swap in a study area's real parcels. See lib/dataset.ts. */
export function setParcels(next: Parcel[]) {
  PARCELS = next;
  USING_REAL_PARCELS = next.length > 0;
  PARCEL_BY_ID = new Map(next.map((p) => [p.id, p]));
  FLAGSHIP_PARCEL_ID = pickFlagship();
}
