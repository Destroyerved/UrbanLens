import type { Facility, GridCell, LandUse, LngLat, Parcel, Road, Ward, Year } from "@/types";
import { apiGet } from "@/lib/api";

/**
 * The active study area's map layers.
 *
 * These used to be baked into the bundle at build time by a sync script, because
 * the old TypeScript analysis engine read them synchronously. That engine is
 * gone — the layers are now only ever rendered, never analysed here — so they
 * are fetched from the Python engine instead. That is what makes the study-area
 * switcher possible at all: four areas baked would be ~14 MB of JavaScript,
 * where four areas fetched cost nothing until they are asked for.
 *
 * The mapping from the engine's vocabulary to the UI's lives here and only here.
 */

/** The engine's land-use vocabulary → this app's. */
const LAND_USE: Record<string, LandUse> = {
  residential: "residential",
  commercial: "commercial",
  industrial: "industrial",
  institutional: "public",
  agriculture: "agriculture",
  vacant: "vacant",
  mixed: "mixed",
  green: "vegetation",
  water: "water",
};

/** The engine's official zoning vocabulary → this app's land-use enum. */
const ZONING: Record<string, LandUse> = {
  residential: "residential",
  commercial: "commercial",
  industrial: "industrial",
  agricultural: "agriculture",
  public_semi_public: "public",
  recreational: "vegetation",
  mixed_use: "mixed",
};

const FACILITY: Record<string, string> = {
  hospital: "hospital",
  clinic: "clinic",
  school: "school",
  college: "school",
  park: "park",
  bus_stop: "transit",
  metro_station: "transit",
  fire_station: "fire",
  police_station: "police",
  government_office: "govt",
};

export interface CityDataset {
  cityId: string;
  parcels: Parcel[];
  wards: Ward[];
  roads: Road[];
  facilities: Facility[];
  grid: GridCell[];
}

const round = (n: number, d = 2) => Number(Number(n).toFixed(d));

/** Exterior ring; for a MultiPolygon, the largest part. */
function outerRing(geometry: Geom): LngLat[] {
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][])[0] as LngLat[];
  let best: number[][] | null = null;
  let bestLen = -1;
  for (const poly of geometry.coordinates as number[][][][]) {
    if (poly[0].length > bestLen) {
      bestLen = poly[0].length;
      best = poly[0];
    }
  }
  return (best ?? []) as LngLat[];
}

const snap = (ring: LngLat[]): LngLat[] =>
  ring.map(([lng, lat]) => [round(lng, 6), round(lat, 6)] as LngLat);

/**
 * Built-up share is the only per-year signal the engine records, so land use per
 * year is reconstructed from it: a parcel below the built-up threshold in an
 * earlier year is treated as having been undeveloped then. Present-day land use
 * is real; the earlier years are inferred, which is what the Time Machine needs
 * and no more than the engine itself claims.
 */
function landUseByYear(
  props: { h2018: number; h2022: number },
  current: LandUse,
): Record<Year, LandUse> {
  const undeveloped: LandUse =
    current === "water" || current === "vegetation" ? current : "vacant";
  const at = (built: number) => (built >= 25 ? current : undeveloped);
  return { 2018: at(props.h2018), 2022: at(props.h2022), 2026: current };
}

/** Cell edge in degrees at the sampling step the population route is asked for. */
const POP_STEP = 2;
const CELL_DEG = 0.00225 * POP_STEP;

const d2 = (ax: number, ay: number, bx: number, by: number) =>
  (ax - bx) ** 2 + (ay - by) ** 2;

function nearestKm(lng: number, lat: number, pts: LngLat[]): number {
  let bd = Infinity;
  for (const [px, py] of pts) {
    const dd = d2(lng, lat, px, py);
    if (dd < bd) bd = dd;
  }
  if (bd === Infinity) return 0;
  // Degrees → km at this latitude; adequate for a nearest-distance field.
  return Math.sqrt(bd) * 111.32 * 0.92;
}

/** Minimal shapes for the engine's GeoJSON — only the fields read below. */
interface Geom {
  type: string;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}
interface Feat<P> {
  geometry: Geom;
  properties: P;
}
interface FC<P> {
  features: Feat<P>[];
}

interface WardProps {
  ward_code: string;
  name: string;
  centroid: LngLat;
  area_sqm: number;
  population: number;
}
interface ParcelProps {
  parcel_id: string;
  survey_number?: string;
  ward: string;
  centroid: LngLat;
  area_sqm: number;
  ownership: string;
  zoning: string;
  land_use: string;
  built_up_percent: number;
  vegetation_percent?: number;
  road_km?: number;
  hospital_km?: number;
  school_km?: number;
  park_km?: number;
  transit_km?: number;
  population_3km?: number;
  flood_risk: string;
  infrastructure_readiness?: number;
  environmental_sensitivity?: number;
  development_potential?: number;
  zoning_conflict?: boolean;
  h2018: number;
  h2022: number;
}
interface FacilityProps {
  id: string;
  name: string;
  facility_type: string;
}
interface RoadProps {
  id: string;
  name: string;
  road_type: string;
}

export async function fetchCityDataset(cityId: string): Promise<CityDataset> {
  const q = { city: cityId };
  const [wardsFC, parcelsFC, facFC, roadsFC, popFC, predFC] = await Promise.all([
    apiGet<FC<WardProps>>("/api/wards", q),
    apiGet<FC<ParcelProps>>("/api/parcels", { ...q, detail: "full" }),
    apiGet<FC<FacilityProps>>("/api/facilities", q),
    apiGet<FC<RoadProps>>("/api/roads", q),
    apiGet<FC<{ population: number }>>("/api/population", { ...q, step: POP_STEP }),
    apiGet<FC<{ growth_probability: number }>>("/api/growth/prediction", q),
  ]);

  const wards: Ward[] = wardsFC.features.map((f) => {
    const p = f.properties;
    const pop = p.population;
    return {
      id: p.ward_code,
      name: p.name,
      ring: snap(outerRing(f.geometry)),
      centroid: p.centroid,
      areaKm2: round(p.area_sqm / 1e6, 2),
      // The engine carries one current figure per ward. Earlier years are
      // back-projected with the same municipal growth factor used to produce it,
      // rather than invented per ward.
      population: {
        2018: Math.round(pop / 1.18),
        2022: Math.round(pop / 1.08),
        2026: pop,
      },
    } as Ward;
  });

  const parcels: Parcel[] = parcelsFC.features.map((f) => {
    const p = f.properties;
    const landUse = LAND_USE[p.land_use] ?? "vacant";
    return {
      id: p.parcel_id,
      surveyNumber: p.survey_number ?? "—",
      wardId: p.ward,
      centroid: p.centroid,
      ring: snap(outerRing(f.geometry)),
      areaHa: round(p.area_sqm / 10_000, 2),
      ownership: p.ownership,
      zoning: ZONING[p.zoning] ?? "mixed",
      landUse,
      landUseByYear: landUseByYear(p, landUse),
      builtUpPct: p.built_up_percent,
      vegetationPct: p.vegetation_percent ?? 0,
      roadDistKm: p.road_km ?? 0,
      hospitalDistKm: p.hospital_km ?? 0,
      schoolDistKm: p.school_km ?? 0,
      parkDistKm: p.park_km ?? 0,
      transitDistKm: p.transit_km ?? 0,
      population3km: p.population_3km ?? 0,
      floodRisk: p.flood_risk,
      infraReadiness: p.infrastructure_readiness ?? 0,
      envSensitivity: p.environmental_sensitivity ?? 0,
      developmentPotential: p.development_potential ?? 0,
      zoningConflict: Boolean(p.zoning_conflict),
    } as Parcel;
  });

  const facilities: Facility[] = facFC.features
    .map((f) => {
      const type = FACILITY[f.properties.facility_type];
      if (!type) return null;
      const [lng, lat] = f.geometry.coordinates as number[];
      return {
        id: f.properties.id,
        name: f.properties.name,
        type,
        coord: [round(lng, 6), round(lat, 6)] as LngLat,
      };
    })
    .filter(Boolean) as Facility[];

  const roads: Road[] = roadsFC.features
    .filter((f) => f.properties.road_type !== "river")
    .map((f: any) => ({
      id: f.properties.id,
      name: f.properties.name,
      path: snap(f.geometry.coordinates as unknown as LngLat[]),
    })) as Road[];

  // 2030 growth probability, taken from the nearest prediction cell.
  const predPts = predFC.features.map((f) => {
    const ring = (f.geometry.coordinates as number[][][])[0];
    let x = 0;
    let y = 0;
    for (const c of ring) {
      x += c[0];
      y += c[1];
    }
    return { lng: x / ring.length, lat: y / ring.length, p: f.properties.growth_probability };
  });
  const nearestGrowth = (lng: number, lat: number) => {
    let best = 0;
    let bd = Infinity;
    for (const q2 of predPts) {
      const dd = d2(lng, lat, q2.lng, q2.lat);
      if (dd < bd) {
        bd = dd;
        best = q2.p;
      }
    }
    return best;
  };

  const hospitals = facilities.filter((f) => f.type === "hospital").map((f) => f.coord);
  const h = CELL_DEG / 2;
  const grid: GridCell[] = popFC.features.map((f, i) => {
    const [lng, lat] = f.geometry.coordinates as number[];
    return {
      id: `cell-${i}`,
      center: [lng, lat] as LngLat,
      ring: [
        [lng - h, lat - h],
        [lng + h, lat - h],
        [lng + h, lat + h],
        [lng - h, lat + h],
        [lng - h, lat - h],
      ] as LngLat[],
      // Each sampled cell stands in for a POP_STEP × POP_STEP block of raster
      // cells, so it carries that block's population — otherwise the grid holds
      // only a fraction of the city and every coverage figure is wrong.
      population: Math.round(f.properties.population * POP_STEP * POP_STEP),
      wardId: wards[0]?.id ?? "",
      growthProb: round(nearestGrowth(lng, lat), 3),
      hospitalDistKm: round(nearestKm(lng, lat, hospitals), 2),
      inCity: true,
    } as GridCell;
  });

  return { cityId, parcels, wards, roads, facilities, grid };
}
