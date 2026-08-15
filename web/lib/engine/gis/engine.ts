import * as turf from "@turf/turf";
import { getCityConfig } from "@/lib/engine/data/store";
import { DEFAULT_CORRIDORS } from "@/lib/engine/config";
import {
  populationWithinKm,
  densityAt,
  populationSamples,
  getPopulationGrid,
} from "@/lib/engine/gis/population";
import {
  buildPointIndex,
  nearestInIndex,
  withinRadius,
  type PointIndex,
} from "@/lib/engine/gis/spatial-index";
import {
  clamp,
  decayScore,
  norm,
  finalScore,
  DEFAULT_WEIGHTS,
  Weights,
  PROJECTS,
  ProjectType,
  ProjectSpec,
  EXPECTED_PER_100K,
  confidenceOf,
  type Confidence,
} from "@/lib/engine/scoring";
import type {
  CityDataset,
  Facility,
  FacilityType,
  Parcel,
  ScoreBreakdown,
} from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Low-level spatial ops (the ST_* equivalents — real geodesic math via turf)
// ---------------------------------------------------------------------------

const km = { units: "kilometers" as const };

const R_EARTH = 6371;
const RAD = Math.PI / 180;

/** Fast inline haversine (km) — called millions of times during enrichment. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const la1 = a[1] * RAD;
  const la2 = b[1] * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

/**
 * Per-city spatial indexes: one point index per facility type, plus one over all
 * road vertices. Built lazily on first use and cached on globalThis so they
 * survive dev HMR alongside the dataset itself.
 */
interface CityIndexes {
  facilities: Map<FacilityType, PointIndex<Facility>>;
  roads: PointIndex<[number, number]>;
}

const gi = globalThis as unknown as { __urbanlens_idx__?: Map<string, CityIndexes> };
const idxCache: Map<string, CityIndexes> = gi.__urbanlens_idx__ ?? new Map();
gi.__urbanlens_idx__ = idxCache;

function indexes(dataset: CityDataset): CityIndexes {
  const hit = idxCache.get(dataset.cityId);
  if (hit) return hit;

  const byType = new Map<FacilityType, Facility[]>();
  for (const f of dataset.facilities.features) {
    const t = f.properties.facility_type;
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(f);
  }
  const facilities = new Map<FacilityType, PointIndex<Facility>>();
  for (const [t, list] of byType) {
    facilities.set(t, buildPointIndex(list, (f) => f.geometry.coordinates as [number, number], 1.5));
  }

  // Distance-to-road uses nearest-vertex haversine — a fast, city-scale-accurate
  // approximation that avoids per-segment projection. Rivers are excluded.
  const verts: [number, number][] = [];
  for (const r of dataset.roads.features) {
    if (r.properties.road_type === "river") continue;
    for (const c of r.geometry.coordinates) verts.push(c as [number, number]);
  }
  const roads = buildPointIndex(verts, (v) => v, 0.75);

  const built: CityIndexes = { facilities, roads };
  idxCache.set(dataset.cityId, built);
  return built;
}

export function nearestByType(
  dataset: CityDataset,
  from: [number, number],
  type: FacilityType
): { facility: Facility | null; km: number } {
  const idx = indexes(dataset).facilities.get(type);
  if (!idx) return { facility: null, km: Infinity };
  const { item, km } = nearestInIndex(idx, from);
  return { facility: item, km };
}

export function roadDistanceKm(dataset: CityDataset, from: [number, number]): number {
  return nearestInIndex(indexes(dataset).roads, from).km;
}

export function facilityCountWithinKm(
  dataset: CityDataset,
  center: [number, number],
  type: FacilityType,
  radiusKm: number
): number {
  const idx = indexes(dataset).facilities.get(type);
  if (!idx) return 0;
  return withinRadius(idx, center, radiusKm).length;
}

// Population queries are served by the ~250 m population raster rather than by
// buffer/ward intersection — see lib/gis/population.ts for why.
export { populationWithinKm, densityAt };

// ---------------------------------------------------------------------------
// Per-parcel enrichment (computed once per dataset, cached on globalThis)
// ---------------------------------------------------------------------------

export interface EnrichedParcel {
  roadKm: number;
  distCenterKm: number;
  nearest: Record<FacilityType, number>;
  pop3km: number;
  scores: {
    accessibility: number;
    transit: number;
    infrastructure: number;
    environment: number;
    development_potential: number;
  };
}

const FACILITY_TYPES: FacilityType[] = [
  "hospital", "clinic", "school", "college", "park",
  "fire_station", "police_station", "bus_stop", "metro_station", "government_office",
];

function environmentScore(p: Parcel["properties"], roadNearRiver: boolean): number {
  let s = 100;
  if (p.flood_risk === "high") s -= 55;
  else if (p.flood_risk === "medium") s -= 28;
  s -= p.water_percent > 20 ? 40 : p.water_percent * 0.8;
  if (roadNearRiver) s -= 10;
  if (p.vegetation_percent > 78) s -= 12; // ecologically sensitive
  return clamp(s);
}

function enrichParcel(dataset: CityDataset, parcel: Parcel, center: [number, number]): EnrichedParcel {
  const c = parcel.properties.centroid;
  const roadKm = roadDistanceKm(dataset, c);
  const distCenterKm = distanceKm(c, center);
  const nearest = {} as Record<FacilityType, number>;
  for (const t of FACILITY_TYPES) nearest[t] = nearestByType(dataset, c, t).km;
  const pop3km = populationWithinKm(dataset, c, 3);

  const transit =
    0.6 * decayScore(nearest.bus_stop, 0.25, 1.5) +
    0.4 * decayScore(nearest.metro_station, 0.6, 5);
  const accessibility =
    0.65 * decayScore(roadKm, 0.25, 2.5) +
    0.35 * decayScore(distCenterKm, 2, 13);
  const utilities = norm(parcel.properties.built_up_percent, 8, 80); // built-up ⇒ serviced
  const infrastructure = clamp(
    0.25 * decayScore(nearest.hospital, 1.5, 8) +
      0.25 * decayScore(nearest.school, 0.8, 3) +
      0.2 * decayScore(nearest.clinic, 0.6, 2.5) +
      0.3 * utilities
  );
  const environment = environmentScore(parcel.properties, roadKm < 0.4 && parcel.properties.flood_risk !== "low");
  const developable = norm(100 - parcel.properties.built_up_percent, 10, 90);
  const development_potential = clamp(
    0.32 * accessibility +
      0.12 * infrastructure +
      0.24 * environment +
      0.22 * developable +
      0.1 * transit
  );

  return {
    roadKm,
    distCenterKm,
    nearest,
    pop3km,
    scores: { accessibility, transit, infrastructure, environment, development_potential },
  };
}

interface EnrichedIndex {
  byId: Map<string, EnrichedParcel>;
}

const g = globalThis as unknown as { __urbanlens_enrich__?: Map<string, EnrichedIndex> };
const enrichCache: Map<string, EnrichedIndex> = g.__urbanlens_enrich__ ?? new Map();
g.__urbanlens_enrich__ = enrichCache;

export function getEnriched(dataset: CityDataset): EnrichedIndex {
  const cached = enrichCache.get(dataset.cityId);
  if (cached) return cached;
  const center = getCityConfig(dataset.cityId).center;
  const byId = new Map<string, EnrichedParcel>();
  for (const parcel of dataset.parcels.features) {
    byId.set(parcel.properties.id, enrichParcel(dataset, parcel, center));
  }
  const idx = { byId };
  enrichCache.set(dataset.cityId, idx);
  return idx;
}

export function enrichedFor(dataset: CityDataset, parcelId: string): EnrichedParcel | undefined {
  return getEnriched(dataset).byId.get(parcelId);
}

// ---------------------------------------------------------------------------
// Suitability (multi-criteria) + land compatibility
// ---------------------------------------------------------------------------

function landCompatibility(parcel: Parcel, spec: ProjectSpec): number {
  const p = parcel.properties;
  const areaHa = p.area_sqm / 10_000;
  const zoningMatch = spec.preferredZoning.includes(p.zoning)
    ? 100
    : p.zoning === "mixed_use"
      ? 65
      : 35;
  const ownership = spec.prefersGovernment
    ? p.ownership === "government"
      ? 100
      : 45
    : 80;
  const areaScore = areaHa >= spec.minAreaHa ? clamp(70 + (areaHa - spec.minAreaHa) * 6, 0, 100) : clamp((areaHa / spec.minAreaHa) * 55);
  // Civic projects prefer developable (low built-up) land; housing tolerates more.
  const civic = spec.addsFacility !== undefined;
  const useScore = civic
    ? clamp(100 - p.built_up_percent * 0.9)
    : clamp(60 + (p.land_use === "vacant" || p.land_use === "agriculture" ? 25 : -10));
  return clamp(0.32 * zoningMatch + 0.25 * ownership + 0.23 * areaScore + 0.2 * useScore);
}

/**
 * Per-cell distance to the nearest facility of a type, over the population
 * raster. Computed once per type (one nearest-neighbour query per cell) and
 * cached, which makes "how many people here are *not* already served?" a cheap
 * windowed sum rather than a per-parcel scan of every facility.
 */
const gCov = globalThis as unknown as {
  __urbanlens_cov__?: Map<string, Map<FacilityType, Float64Array>>;
};
const covCache: Map<string, Map<FacilityType, Float64Array>> = gCov.__urbanlens_cov__ ?? new Map();
gCov.__urbanlens_cov__ = covCache;

function facilityDistanceField(dataset: CityDataset, type: FacilityType): Float64Array {
  let perCity = covCache.get(dataset.cityId);
  if (!perCity) {
    perCity = new Map();
    covCache.set(dataset.cityId, perCity);
  }
  const hit = perCity.get(type);
  if (hit) return hit;

  const grid = getPopulationGrid(dataset);
  const field = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  for (let r = 0; r < grid.rows; r++) {
    const lat = grid.minLat + (r + 0.5) * grid.cellLat;
    for (let c = 0; c < grid.cols; c++) {
      const i = r * grid.cols + c;
      if (grid.pop[i] === 0) continue; // only populated cells matter
      const lng = grid.minLng + (c + 0.5) * grid.cellLng;
      field[i] = nearestByType(dataset, [lng, lat], type).km;
    }
  }
  perCity.set(type, field);
  return field;
}

/**
 * People within `radiusKm` of a point who are NOT already within
 * `serviceRadiusKm` of an existing facility of this type — i.e. the population a
 * new facility here would actually start serving.
 */
export function unservedPopulationWithinKm(
  dataset: CityDataset,
  center: [number, number],
  radiusKm: number,
  type: FacilityType,
  serviceRadiusKm: number
): number {
  const grid = getPopulationGrid(dataset);
  const field = facilityDistanceField(dataset, type);
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((center[1] * Math.PI) / 180), 0.01));

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
      if (field[i] <= serviceRadiusKm) continue; // already served
      const lng = grid.minLng + (c + 0.5) * grid.cellLng;
      if (distanceKm(center, [lng, lat]) <= radiusKm) sum += grid.pop[i];
    }
  }
  return Math.round(sum);
}

/**
 * Population need for a project.
 *
 * For a facility that provides a service, need means **unmet** need: the people
 * a new facility would actually start serving. Scoring raw catchment population
 * instead ranks dense, central, already-well-served land highest — which then
 * simulates as zero improvement, because everyone there can already reach one.
 * Aligning this with what the simulator measures keeps site selection and
 * impact telling the same story.
 */
function populationNeed(
  dataset: CityDataset,
  parcel: Parcel,
  spec: ProjectSpec,
  enriched: EnrichedParcel
): { score: number; pop: number; unserved: number; nearestNeedKm: number } {
  const pop = populationWithinKm(dataset, parcel.properties.centroid, spec.serviceRadiusKm);
  const popScore = norm(pop, 4000, 130000);
  if (!spec.needFacility) {
    // Housing, commercial and industrial are not services — raw demand is the
    // right signal for them.
    return { score: popScore, pop, unserved: pop, nearestNeedKm: -1 };
  }

  const unserved = unservedPopulationWithinKm(
    dataset,
    parcel.properties.centroid,
    spec.serviceRadiusKm,
    spec.needFacility,
    spec.serviceRadiusKm
  );
  const unservedScore = norm(unserved, 2000, 80000);
  const nearestNeedKm = enriched.nearest[spec.needFacility];
  const gap = 100 - decayScore(nearestNeedKm, spec.serviceRadiusKm * 0.5, spec.serviceRadiusKm * 2.2);

  // Unmet population dominates; distance to the nearest existing facility and
  // overall density remain as secondary signals.
  return {
    score: clamp(0.6 * unservedScore + 0.25 * gap + 0.15 * popScore),
    pop,
    unserved,
    nearestNeedKm,
  };
}

export interface SuitabilityResult {
  parcel_id: string;
  breakdown: ScoreBreakdown;
  final: number;
  pop: number;
  /** Of `pop`, those not already within the service radius of this facility type. */
  unserved: number;
  nearestNeedKm: number;
  metrics: { roadKm: number; floodRisk: string; ownership: string; areaAcres: number };
  explanation: { pros: string[]; cons: string[] };
  centroid: [number, number];
}

export function suitabilityForParcel(
  dataset: CityDataset,
  parcel: Parcel,
  projectType: ProjectType,
  weights: Weights = DEFAULT_WEIGHTS
): SuitabilityResult {
  const spec = PROJECTS[projectType];
  const e = enrichedFor(dataset, parcel.properties.id) ?? getEnriched(dataset).byId.get(parcel.properties.id)!;
  const need = populationNeed(dataset, parcel, spec, e);
  const breakdown: ScoreBreakdown = {
    accessibility: Math.round(e.scores.accessibility),
    population_need: Math.round(need.score),
    transit: Math.round(e.scores.transit),
    infrastructure: Math.round(e.scores.infrastructure),
    environment: Math.round(e.scores.environment),
    land_compatibility: Math.round(landCompatibility(parcel, spec)),
  };
  const final = Math.round(finalScore(breakdown, weights));

  const p = parcel.properties;
  const pros: string[] = [];
  const cons: string[] = [];
  if (p.ownership === "government") pros.push("Government-owned land — no acquisition needed");
  else cons.push("Privately owned — may require land acquisition");
  if (e.roadKm < 1.2) pros.push(`${e.roadKm.toFixed(1)} km from an arterial road`);
  else cons.push(`${e.roadKm.toFixed(1)} km from nearest arterial road`);
  // Lead with unmet need — the people this would actually start serving —
  // rather than raw catchment, which flatters already-covered central land.
  if (spec.needFacility && need.unserved > 2000) {
    pros.push(
      `Reaches ~${need.unserved.toLocaleString()} residents with no ${spec.label.toLowerCase()} within ${spec.serviceRadiusKm} km`
    );
  } else if (spec.needFacility) {
    cons.push(
      `Little unmet demand — almost everyone within ${spec.serviceRadiusKm} km can already reach a ${spec.label.toLowerCase()}`
    );
  }
  if (need.pop > 30000)
    pros.push(`Dense catchment — ~${need.pop.toLocaleString()} residents within ${spec.serviceRadiusKm} km`);
  if (p.flood_risk === "low") pros.push("Low flood exposure");
  else cons.push(`${p.flood_risk === "high" ? "High" : "Moderate"} flood risk`);
  if (breakdown.transit < 45) cons.push(`Limited public transport — ${e.nearest.bus_stop.toFixed(1)} km to nearest bus stop`);
  else pros.push("Well connected to public transport");
  if (p.area_sqm / 10_000 >= spec.minAreaHa) pros.push(`Adequate parcel size (${(p.area_sqm / 10_000).toFixed(1)} ha)`);
  else cons.push(`Below preferred size (${(p.area_sqm / 10_000).toFixed(1)} ha < ${spec.minAreaHa} ha)`);
  if (breakdown.environment < 55) cons.push("Environmental constraints reduce suitability");

  return {
    parcel_id: p.parcel_id,
    breakdown,
    final,
    pop: need.pop,
    unserved: need.unserved,
    nearestNeedKm: need.nearestNeedKm,
    metrics: { roadKm: e.roadKm, floodRisk: p.flood_risk, ownership: p.ownership, areaAcres: p.area_acres },
    explanation: { pros, cons },
    centroid: p.centroid,
  };
}

// ---------------------------------------------------------------------------
// Site search
// ---------------------------------------------------------------------------

export interface SiteSearchRequest {
  project_type: ProjectType;
  minimum_area_hectares?: number;
  government_land?: boolean;
  max_road_distance_km?: number;
  low_flood_risk?: boolean;
  /**
   * Minimum residents currently beyond reach of this service. Defaults to
   * DEFAULT_MIN_UNSERVED for facilities that provide one; pass 0 to rank purely
   * on the weighted score.
   *
   * This is a constraint rather than a weight because "nobody new is served" is
   * disqualifying for a service facility, not merely one factor among six —
   * without it, dense well-served central land outranks genuine need, and the
   * chosen site then simulates as zero improvement.
   */
  min_unserved_population?: number;
  weights?: Weights;
  limit?: number;
}

/** Enough people to justify a facility, and enough to show up in a simulation. */
export const DEFAULT_MIN_UNSERVED = 5000;

export function searchSites(dataset: CityDataset, req: SiteSearchRequest): {
  results: SuitabilityResult[];
  evaluated: number;
  eligible: number;
} {
  const spec = PROJECTS[req.project_type];
  const minHa = req.minimum_area_hectares ?? spec.minAreaHa;
  const weights = req.weights ?? DEFAULT_WEIGHTS;
  const limit = req.limit ?? 12;
  const minUnserved = spec.addsFacility
    ? (req.min_unserved_population ?? DEFAULT_MIN_UNSERVED)
    : 0;

  let eligible = 0;
  const scored: SuitabilityResult[] = [];
  for (const parcel of dataset.parcels.features) {
    const p = parcel.properties;
    if (p.area_sqm / 10_000 < minHa) continue;
    if (req.government_land && p.ownership !== "government") continue;
    if (req.low_flood_risk && p.flood_risk === "high") continue;
    const e = getEnriched(dataset).byId.get(p.id)!;
    if (req.max_road_distance_km != null && e.roadKm > req.max_road_distance_km) continue;
    const result = suitabilityForParcel(dataset, parcel, req.project_type, weights);
    if (minUnserved > 0 && result.unserved < minUnserved) continue;
    eligible++;
    scored.push(result);
  }
  scored.sort((a, b) => b.final - a.final);
  return { results: scored.slice(0, limit), evaluated: dataset.parcels.features.length, eligible };
}

// ---------------------------------------------------------------------------
// Parcel intelligence profile
// ---------------------------------------------------------------------------

/**
 * Land-use change between the earliest and latest built-up snapshots (PRD §22).
 * Returns null when the shift is too small to call a transition.
 */
export function landUseChange(p: Parcel["properties"]) {
  const years = Object.keys(p.history)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length < 2) return null;
  const first = years[0];
  const last = years[years.length - 1];
  const from = p.history[first] ?? 0;
  const to = p.history[last] ?? 0;
  const delta = to - from;

  let transition: string | null = null;
  if (delta >= 25) {
    // A large built-up gain on land officially zoned agricultural is the
    // headline conversion planners watch for.
    transition =
      p.zoning === "agricultural"
        ? "Agricultural → Built-Up"
        : p.land_use === "industrial"
          ? "Open Land → Industrial"
          : "Vacant → Built-Up";
  } else if (delta >= 12) {
    transition = "Gradual densification";
  } else if (delta <= -8) {
    transition = "Built-up decline";
  }

  return {
    from_year: first,
    to_year: last,
    built_up_from: from,
    built_up_to: to,
    delta,
    transition,
    rapid: delta >= 25,
    series: years.map((y) => ({ year: y, built_up_percent: p.history[y] ?? 0 })),
  };
}

/**
 * Environmental constraint checklist (PRD §25) — the checks that should clear
 * before development is recommended, each stated as pass/warn with its reason.
 */
export function environmentalConstraints(p: Parcel["properties"]) {
  const checks: { label: string; ok: boolean; detail: string }[] = [
    {
      label: "Flood zone",
      ok: p.flood_risk === "low",
      detail:
        p.flood_risk === "low"
          ? "Outside modelled flood-prone area"
          : `${p.flood_risk === "high" ? "High" : "Moderate"} flood risk — near watercourse or low-lying`,
    },
    {
      label: "Water-body overlap",
      ok: p.water_percent <= 5,
      detail:
        p.water_percent <= 5
          ? "No significant water-body overlap"
          : `${p.water_percent}% of the parcel is water`,
    },
    {
      label: "Ecological sensitivity",
      ok: p.vegetation_percent <= 75,
      detail:
        p.vegetation_percent <= 75
          ? `${p.vegetation_percent}% vegetation cover — low ecological sensitivity`
          : `${p.vegetation_percent}% vegetation cover — clearing would remove significant green cover`,
    },
    {
      label: "Terrain / drainage",
      ok: p.elevation_m >= 44,
      detail:
        p.elevation_m >= 44
          ? `${p.elevation_m} m elevation — adequate drainage`
          : `${p.elevation_m} m elevation — low-lying, drainage needs review`,
    },
  ];
  const failed = checks.filter((c) => !c.ok).length;
  return {
    risk: failed === 0 ? "low" : failed === 1 ? "medium" : "high",
    checks,
  };
}

export function parcelIntelligence(dataset: CityDataset, parcel: Parcel) {
  const e = getEnriched(dataset).byId.get(parcel.properties.id)!;
  const p = parcel.properties;
  const recommendedProjects: ProjectType[] = [
    "hospital", "residential", "school", "park", "commercial", "affordable_housing",
  ];
  const recommended = recommendedProjects
    .map((pt) => ({
      project: pt,
      label: PROJECTS[pt].label,
      score: suitabilityForParcel(dataset, parcel, pt).final,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    parcel_id: p.parcel_id,
    survey_number: p.survey_number,
    area_acres: p.area_acres,
    area_sqm: p.area_sqm,
    ownership: p.ownership,
    owner_category: p.owner_category,
    // Provenance for this specific parcel, so the panel can distinguish a real
    // mapped boundary from a generated one and confirmed tenure from modelled.
    source: p.source ?? "synthetic",
    osm_tag: p.osm_tag ?? null,
    name: p.name ?? null,
    tenure_known: p.tenure_known ?? false,
    zoning: p.zoning,
    land_use: p.land_use,
    ward: p.ward,
    built_up_percent: p.built_up_percent,
    vegetation_percent: p.vegetation_percent,
    water_percent: p.water_percent,
    flood_risk: p.flood_risk,
    elevation_m: p.elevation_m,
    history: p.history,
    land_use_change: landUseChange(p),
    environment: environmentalConstraints(p),
    centroid: p.centroid,
    distances: {
      road_km: Number(e.roadKm.toFixed(2)),
      hospital_km: Number(e.nearest.hospital.toFixed(2)),
      school_km: Number(e.nearest.school.toFixed(2)),
      park_km: Number(e.nearest.park.toFixed(2)),
      bus_stop_km: Number(e.nearest.bus_stop.toFixed(2)),
      metro_km: Number(e.nearest.metro_station.toFixed(2)),
    },
    population_3km: e.pop3km,
    scores: {
      accessibility: Math.round(e.scores.accessibility),
      infrastructure_readiness: Math.round(e.scores.infrastructure),
      environmental_suitability: Math.round(e.scores.environment),
      development_potential: Math.round(e.scores.development_potential),
      transit: Math.round(e.scores.transit),
    },
    recommended_uses: recommended,
  };
}

// ---------------------------------------------------------------------------
// Infrastructure gap analysis (per ward)
// ---------------------------------------------------------------------------

export interface WardInfra {
  ward_code: string;
  name: string;
  population: number;
  centroid: [number, number];
  /**
   * Municipal ward or peri-urban taluka remnant. They differ by two orders of
   * magnitude in area, so a consumer ranking them must be able to say which is
   * which rather than presenting a 500 km² rural unit as a comparable "ward".
   */
  kind: "ward" | "taluka";
  area_km2: number;
  scores: {
    healthcare: number;
    education: number;
    parks: number;
    transportation: number;
    road_connectivity: number;
  };
  overall: number;
  priority: number; // population × unmet need
}

export type ServiceKey = keyof WardInfra["scores"];

/**
 * How completely OSM has mapped the facilities behind each service score, city-
 * wide. A "low" service is one where the map itself is sparse, so a poor score
 * there is weak evidence of a real gap and must be presented as such.
 */
export interface CoverageReport {
  service: ServiceKey;
  confidence: Confidence;
  mapped: number;
  expected: number;
  note: string;
}

const SERVICE_INPUTS: Record<ServiceKey, FacilityType[]> = {
  healthcare: ["hospital", "clinic"],
  education: ["school", "college"],
  parks: ["park"],
  transportation: ["bus_stop", "metro_station"],
  road_connectivity: [],
};

export function coverageReport(dataset: CityDataset): CoverageReport[] {
  const population = dataset.wards.features.reduce((s, w) => s + w.properties.population, 0);
  const counts = new Map<FacilityType, number>();
  for (const f of dataset.facilities.features) {
    const t = f.properties.facility_type;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  return (Object.keys(SERVICE_INPUTS) as ServiceKey[]).map((service) => {
    const types = SERVICE_INPUTS[service];
    if (!types.length) {
      // Road connectivity comes from the road network, which OSM maps well.
      return {
        service,
        confidence: "high" as Confidence,
        mapped: dataset.roads.features.length,
        expected: dataset.roads.features.length,
        note: "Derived from the OSM road network, which is well mapped for major roads.",
      };
    }
    const mapped = types.reduce((s, t) => s + (counts.get(t) ?? 0), 0);
    const expected = Math.round(
      types.reduce((s, t) => s + EXPECTED_PER_100K[t], 0) * (population / 100_000)
    );
    const ratio = expected > 0 ? mapped / expected : 0;
    const confidence = confidenceOf(ratio);
    const note =
      confidence === "high"
        ? `${mapped.toLocaleString()} mapped — coverage looks broadly complete.`
        : `Only ${mapped.toLocaleString()} mapped against roughly ${expected.toLocaleString()} expected for this population. OpenStreetMap under-records this facility type here, so low scores may reflect missing map data rather than a real service gap.`;
    return { service, confidence, mapped, expected, note };
  });
}

export function infrastructureGaps(dataset: CityDataset): WardInfra[] {
  const out: WardInfra[] = [];
  for (let wi = 0; wi < dataset.wards.features.length; wi++) {
    const w = dataset.wards.features[wi];

    // Score where the people are, not at the geometric centre. For a compact
    // city ward these coincide; for a large peri-urban unit the centroid sits in
    // open land and would report every service as unreachable.
    const samples = populationSamples(dataset, wi);
    const points: { point: [number, number]; weight: number }[] = samples.length
      ? samples
      : [{ point: w.properties.centroid, weight: 1 }];
    const weightSum = points.reduce((s, p) => s + p.weight, 0) || 1;

    const perCap = (type: FacilityType, radius: number, good: number, bad: number) => {
      let acc = 0;
      for (const { point, weight } of points) {
        const nearest = nearestByType(dataset, point, type).km;
        const count = facilityCountWithinKm(dataset, point, type, radius);
        const per100k = (count / Math.max(w.properties.population, 1)) * 100_000;
        acc += weight * clamp(0.6 * decayScore(nearest, good, bad) + 0.4 * norm(per100k, 0, 6));
      }
      return acc / weightSum;
    };
    const healthcare = clamp(0.6 * perCap("hospital", 6, 1.5, 7) + 0.4 * perCap("clinic", 3, 0.6, 2.5));
    const education = clamp(0.7 * perCap("school", 3, 0.8, 3) + 0.3 * perCap("college", 8, 2, 9));
    const parks = perCap("park", 2.5, 0.8, 2.5);
    const transportation = clamp(0.6 * perCap("bus_stop", 1.5, 0.3, 1.5) + 0.4 * perCap("metro_station", 6, 0.8, 6));
    const road_connectivity =
      points.reduce((s, { point, weight }) => s + weight * decayScore(roadDistanceKm(dataset, point), 0.3, 2.5), 0) /
      weightSum;
    const overall = clamp(
      0.3 * healthcare + 0.22 * education + 0.16 * parks + 0.22 * transportation + 0.1 * road_connectivity
    );
    out.push({
      ward_code: w.properties.ward_code,
      name: w.properties.name,
      population: w.properties.population,
      centroid: w.properties.centroid,
      kind: w.properties.kind ?? "ward",
      area_km2: Number((w.properties.area_sqm / 1e6).toFixed(1)),
      scores: {
        healthcare: Math.round(healthcare),
        education: Math.round(education),
        parks: Math.round(parks),
        transportation: Math.round(transportation),
        road_connectivity: Math.round(road_connectivity),
      },
      overall: Math.round(overall),
      priority: Math.round(w.properties.population * (1 - overall / 100)),
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------------------
// Urban Livability Score (PRD §15)
// ---------------------------------------------------------------------------

/**
 * Weights for the livability blend. Kept explicit and summing to 1 so the score
 * is auditable — a planner can see exactly what moved it.
 */
export const LIVABILITY_WEIGHTS = {
  healthcare: 0.18,
  education: 0.16,
  green_space: 0.14,
  transportation: 0.16,
  public_services: 0.1,
  road_connectivity: 0.1,
  environmental_quality: 0.16,
} as const;

export type LivabilityComponent = keyof typeof LIVABILITY_WEIGHTS;

export interface WardLivability {
  ward_code: string;
  name: string;
  population: number;
  population_density: number;
  centroid: [number, number];
  components: Record<LivabilityComponent, number>;
  score: number;
  band: "excellent" | "good" | "moderate" | "poor";
}

function band(score: number): WardLivability["band"] {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 50) return "moderate";
  return "poor";
}

/**
 * Environmental quality per ward, derived from the parcels sampled inside it:
 * vegetation cover raises it, flood exposure and heavy built-up coverage lower
 * it. Falls back to the city median when a ward holds no sampled parcels.
 */
function environmentalQualityByWard(dataset: CityDataset): Map<string, number> {
  const agg = new Map<string, { veg: number; built: number; flood: number; n: number }>();
  for (const p of dataset.parcels.features) {
    const pr = p.properties;
    const a = agg.get(pr.ward) ?? { veg: 0, built: 0, flood: 0, n: 0 };
    a.veg += pr.vegetation_percent;
    a.built += pr.built_up_percent;
    a.flood += pr.flood_risk === "high" ? 2 : pr.flood_risk === "medium" ? 1 : 0;
    a.n++;
    agg.set(pr.ward, a);
  }
  const out = new Map<string, number>();
  for (const [ward, a] of agg) {
    if (!a.n) continue;
    const veg = a.veg / a.n;
    const built = a.built / a.n;
    const flood = a.flood / a.n; // 0..2
    out.set(
      ward,
      clamp(0.45 * norm(veg, 5, 55) + 0.3 * norm(100 - built, 20, 90) + 0.25 * (100 - flood * 50))
    );
  }
  return out;
}

export function livability(dataset: CityDataset): WardLivability[] {
  const gaps = new Map(infrastructureGaps(dataset).map((g) => [g.ward_code, g]));
  const env = environmentalQualityByWard(dataset);
  const envValues = [...env.values()].sort((a, b) => a - b);
  const envMedian = envValues.length ? envValues[Math.floor(envValues.length / 2)] : 60;

  const out: WardLivability[] = [];
  for (const w of dataset.wards.features) {
    const p = w.properties;
    const g = gaps.get(p.ward_code);
    if (!g) continue;

    // Public services = civic access (government offices, police, fire).
    const c = p.centroid;
    const publicServices = clamp(
      0.4 * decayScore(nearestByType(dataset, c, "government_office").km, 1.5, 7) +
        0.3 * decayScore(nearestByType(dataset, c, "police_station").km, 1.2, 5) +
        0.3 * decayScore(nearestByType(dataset, c, "fire_station").km, 2.5, 9)
    );

    const components: Record<LivabilityComponent, number> = {
      healthcare: g.scores.healthcare,
      education: g.scores.education,
      green_space: g.scores.parks,
      transportation: g.scores.transportation,
      public_services: Math.round(publicServices),
      road_connectivity: g.scores.road_connectivity,
      environmental_quality: Math.round(env.get(p.ward_code) ?? envMedian),
    };

    let score = 0;
    for (const k of Object.keys(LIVABILITY_WEIGHTS) as LivabilityComponent[]) {
      score += LIVABILITY_WEIGHTS[k] * components[k];
    }
    const rounded = Math.round(clamp(score));

    out.push({
      ward_code: p.ward_code,
      name: p.name,
      population: p.population,
      population_density: p.population_density,
      centroid: p.centroid,
      components,
      score: rounded,
      band: band(rounded),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 15-minute city
// ---------------------------------------------------------------------------

const WALK_KMH = 4.8;
const DRIVE_KMH = 22;

const FIFTEEN_MIN: { type: FacilityType; mode: "walk" | "drive" }[] = [
  { type: "hospital", mode: "drive" },
  { type: "clinic", mode: "walk" },
  { type: "school", mode: "walk" },
  { type: "park", mode: "walk" },
  { type: "bus_stop", mode: "walk" },
  { type: "metro_station", mode: "drive" },
  { type: "government_office", mode: "drive" },
];

export function fifteenMinute(dataset: CityDataset, point: [number, number]) {
  const items = FIFTEEN_MIN.map(({ type, mode }) => {
    const dist = nearestByType(dataset, point, type).km;
    const speed = mode === "walk" ? WALK_KMH : DRIVE_KMH;
    const minutes = (dist / speed) * 60;
    return { facility_type: type, mode, distance_km: Number(dist.toFixed(2)), minutes: Math.round(minutes), reachable: minutes <= 15 };
  });
  const score = Math.round((items.filter((i) => i.reachable).length / items.length) * 100);
  return { point, items, score };
}

// ---------------------------------------------------------------------------
// Growth analysis + corridors
// ---------------------------------------------------------------------------

export function growthSummary(dataset: CityDataset) {
  const years = [2018, 2022, 2026];
  // Built-up AREA is estimated at ward resolution: mean built-up % of the
  // parcels sampled in a ward × the ward's full area (areal up-scaling), so the
  // figure reflects the whole city rather than only sampled parcel footprints.
  const wardAgg = new Map<string, { area: number; sum: Record<number, number>; n: number }>();
  for (const w of dataset.wards.features)
    wardAgg.set(w.properties.ward_code, { area: w.properties.area_sqm, sum: { 2018: 0, 2022: 0, 2026: 0 }, n: 0 });
  let vegLossParcels = 0;
  let agriToBuilt = 0;
  for (const p of dataset.parcels.features) {
    const agg = wardAgg.get(p.properties.ward);
    if (agg) {
      for (const y of years) agg.sum[y] += p.properties.history[y] ?? 0;
      agg.n++;
    }
    const delta = (p.properties.history[2026] ?? 0) - (p.properties.history[2018] ?? 0);
    if (delta > 25) {
      vegLossParcels++;
      if (p.properties.land_use === "residential" || p.properties.land_use === "mixed") agriToBuilt++;
    }
  }
  const builtByYear: Record<number, number> = { 2018: 0, 2022: 0, 2026: 0 };
  for (const agg of wardAgg.values()) {
    if (!agg.n) continue;
    for (const y of years) builtByYear[y] += (agg.area * (agg.sum[y] / agg.n)) / 100;
  }
  const km2 = (m2: number) => Number((m2 / 1e6).toFixed(0));
  const b2018 = km2(builtByYear[2018]);
  const b2026 = km2(builtByYear[2026]);
  const growthPct = Number((((b2026 - b2018) / Math.max(b2018, 0.01)) * 100).toFixed(1));

  return {
    built_up_km2: { 2018: b2018, 2022: km2(builtByYear[2022]), 2026: b2026 },
    growth_pct_2018_2026: growthPct,
    parcels_urbanising: vegLossParcels,
    agri_to_built: agriToBuilt,
    corridors: corridorSummary(dataset),
  };
}

function corridorSummary(dataset: CityDataset) {
  const config = getCityConfig(dataset.cityId);
  // Corridors are declared per city, so a region can report an axis — the
  // Ahmedabad–Gandhinagar spine — that neither municipality has on its own.
  const defs = config.corridors ?? DEFAULT_CORRIDORS;
  // Bearings are measured from the primary core, which for a multi-core region
  // is the dominant city rather than the geometric centre of the bounding box.
  const center = (config.cores?.length ? config.cores[0] : config.center) as [number, number];
  const bearing = (to: [number, number]) => {
    const [alng, alat] = center;
    const [blng, blat] = to;
    const y = Math.sin(((blng - alng) * Math.PI) / 180) * Math.cos((blat * Math.PI) / 180);
    const x =
      Math.cos((alat * Math.PI) / 180) * Math.sin((blat * Math.PI) / 180) -
      Math.sin((alat * Math.PI) / 180) * Math.cos((blat * Math.PI) / 180) * Math.cos(((blng - alng) * Math.PI) / 180);
    return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
  };
  const angDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  return defs.map((d) => {
    let hist = 0;
    let n = 0;
    let pop = 0;
    let predicted = 0;
    let pn = 0;
    for (const p of dataset.parcels.features) {
      if (angDiff(bearing(p.properties.centroid), d.bearing) > 35) continue;
      hist += (p.properties.history[2026] ?? 0) - (p.properties.history[2018] ?? 0);
      n++;
    }
    for (const cell of dataset.prediction.features) {
      const cx = cell.geometry.coordinates[0][0][0];
      const cy = cell.geometry.coordinates[0][0][1];
      if (angDiff(bearing([cx, cy]), d.bearing) > 35) continue;
      predicted += cell.properties.growth_probability;
      pn++;
    }
    for (const w of dataset.wards.features) {
      if (angDiff(bearing(w.properties.centroid), d.bearing) > 35) continue;
      pop += w.properties.population;
    }
    return {
      name: d.name,
      risk: d.risk,
      historical_growth_pts: n ? Math.round(hist / n) : 0,
      predicted_growth_pct: pn ? Math.round((predicted / pn) * 100) : 0,
      population: pop,
    };
  });
}

// ---------------------------------------------------------------------------
// Zoning conflict detection
// ---------------------------------------------------------------------------

export interface ZoningConflict {
  parcel_id: string;
  ward: string;
  official: string;
  detected: string;
  type: string;
  severity: "high" | "medium";
  centroid: [number, number];
}

export function zoningConflicts(dataset: CityDataset): ZoningConflict[] {
  const out: ZoningConflict[] = [];
  for (const p of dataset.parcels.features) {
    const pr = p.properties;
    const built = pr.built_up_percent;
    let type = "";
    let severity: "high" | "medium" = "medium";
    if (pr.zoning === "agricultural" && built > 40) {
      type = "Agricultural land built-up";
      severity = built > 65 ? "high" : "medium";
    } else if (pr.zoning === "residential" && (pr.land_use === "industrial")) {
      type = "Industrial use in residential zone";
      severity = "high";
    } else if (pr.zoning === "recreational" && built > 35) {
      type = "Encroachment on recreational land";
      severity = "high";
    } else if (pr.zoning === "public_semi_public" && pr.land_use === "commercial") {
      type = "Commercial use on public land";
      severity = "medium";
    }
    if (!type) continue;
    out.push({
      parcel_id: pr.parcel_id,
      ward: pr.ward,
      official: pr.zoning,
      detected: pr.land_use,
      type,
      severity,
      centroid: pr.centroid,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// What-if simulator
// ---------------------------------------------------------------------------

export interface SimulateRequest {
  project_type: ProjectType;
  lng: number;
  lat: number;
  capacity?: number;
}

/** Deterministic spiral sample of points within a radius (for catchment coverage). */
function sampleDisc(center: [number, number], radiusKm: number, n: number): [number, number][] {
  const pts: [number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = radiusKm * Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    const dest = turf.destination(turf.point(center), r, (a * 180) / Math.PI, km);
    pts.push(dest.geometry.coordinates as [number, number]);
  }
  return pts;
}

export function simulate(dataset: CityDataset, req: SimulateRequest) {
  const spec = PROJECTS[req.project_type];
  const site: [number, number] = [req.lng, req.lat];
  const R = spec.serviceRadiusKm;
  const type = spec.addsFacility;

  if (!type) {
    return {
      project_type: req.project_type,
      label: spec.label,
      site,
      service_radius_km: R,
      applicable: false,
      message: "Coverage simulation applies to service facilities (hospital, school, park, etc.).",
    };
  }

  // Analyse a window wider than one service radius so the before/after coverage
  // is a realistic area figure (not trivially 100%). Sample points are weighted
  // by local population density (areal), and coverage = share within R of a
  // same-type facility, before vs after adding the proposed one.
  const analysisRadius = R * 1.8;
  const windowPop = populationWithinKm(dataset, site, analysisRadius);
  const samples = sampleDisc(site, analysisRadius, 340);
  let wSum = 0;
  let coveredBefore = 0;
  let coveredAfter = 0;
  let distBefore = 0;
  let distAfter = 0;
  for (const s of samples) {
    const dens = densityAt(dataset, s);
    if (dens <= 0) continue;
    wSum += dens;
    const nearestExisting = nearestByType(dataset, s, type).km;
    const nearestAfter = Math.min(nearestExisting, distanceKm(s, site));
    distBefore += dens * nearestExisting;
    distAfter += dens * nearestAfter;
    if (nearestExisting <= R) coveredBefore += dens;
    if (nearestAfter <= R) coveredAfter += dens;
  }
  const beforePct = wSum ? (coveredBefore / wSum) * 100 : 0;
  const afterPct = wSum ? (coveredAfter / wSum) * 100 : 0;
  const newlyFrac = wSum ? (coveredAfter - coveredBefore) / wSum : 0;

  return {
    project_type: req.project_type,
    label: spec.label,
    site,
    applicable: true,
    service_radius_km: R,
    analysis_radius_km: Number(analysisRadius.toFixed(1)),
    window_population: windowPop,
    catchment_population: populationWithinKm(dataset, site, R),
    residents_newly_covered: Math.round(windowPop * newlyFrac),
    coverage_before_pct: Number(beforePct.toFixed(1)),
    coverage_after_pct: Number(afterPct.toFixed(1)),
    avg_distance_before_km: Number((wSum ? distBefore / wSum : 0).toFixed(2)),
    avg_distance_after_km: Number((wSum ? distAfter / wSum : 0).toFixed(2)),
  };
}
