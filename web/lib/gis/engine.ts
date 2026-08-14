import * as turf from "@turf/turf";
import { getCityConfig } from "@/lib/data/store";
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
} from "@/lib/scoring";
import type {
  CityDataset,
  Facility,
  FacilityType,
  Parcel,
  ScoreBreakdown,
  Ward,
} from "@/lib/types";

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

const facByTypeCache = new Map<string, Map<FacilityType, Facility[]>>();
function facilitiesByType(dataset: CityDataset): Map<FacilityType, Facility[]> {
  const hit = facByTypeCache.get(dataset.cityId);
  if (hit) return hit;
  const m = new Map<FacilityType, Facility[]>();
  for (const f of dataset.facilities.features) {
    const t = f.properties.facility_type;
    (m.get(t) ?? m.set(t, []).get(t)!).push(f);
  }
  facByTypeCache.set(dataset.cityId, m);
  return m;
}

export function nearestByType(
  dataset: CityDataset,
  from: [number, number],
  type: FacilityType
): { facility: Facility | null; km: number } {
  let best: Facility | null = null;
  let bestKm = Infinity;
  for (const f of facilitiesByType(dataset).get(type) ?? []) {
    const d = distanceKm(from, f.geometry.coordinates as [number, number]);
    if (d < bestKm) {
      bestKm = d;
      best = f;
    }
  }
  return { facility: best, km: bestKm };
}

/**
 * Cached flat array of road vertices (rivers excluded). Distance-to-road uses
 * nearest-vertex haversine — a fast, city-scale-accurate approximation that
 * scales to thousands of OSM road segments without per-segment projection.
 */
const roadVtxCache = new Map<string, [number, number][]>();
function roadVertices(dataset: CityDataset): [number, number][] {
  const hit = roadVtxCache.get(dataset.cityId);
  if (hit) return hit;
  const verts: [number, number][] = [];
  for (const r of dataset.roads.features) {
    if (r.properties.road_type === "river") continue;
    for (const c of r.geometry.coordinates) verts.push(c as [number, number]);
  }
  roadVtxCache.set(dataset.cityId, verts);
  return verts;
}

export function roadDistanceKm(dataset: CityDataset, from: [number, number]): number {
  const verts = roadVertices(dataset);
  let m = Infinity;
  for (const v of verts) {
    const d = distanceKm(from, v);
    if (d < m) m = d;
  }
  return m;
}

export function facilityCountWithinKm(
  dataset: CityDataset,
  center: [number, number],
  type: FacilityType,
  radiusKm: number
): number {
  let n = 0;
  for (const f of facilitiesByType(dataset).get(type) ?? []) {
    if (distanceKm(center, f.geometry.coordinates as [number, number]) <= radiusKm) n++;
  }
  return n;
}

/** Wards whose centroid is within `radiusKm + tile` of a point (cheap pre-filter). */
function wardsNear(dataset: CityDataset, center: [number, number], radiusKm: number): Ward[] {
  return dataset.wards.features.filter(
    (w) => distanceKm(center, w.properties.centroid) <= radiusKm + 3
  );
}

/**
 * Population within a radius via areal interpolation: intersect a buffer with
 * each nearby ward and allocate that ward's population by area fraction.
 */
export function populationWithinKm(
  dataset: CityDataset,
  center: [number, number],
  radiusKm: number
): number {
  const buffer = turf.buffer(turf.point(center), radiusKm, km);
  if (!buffer) return 0;
  let total = 0;
  for (const w of wardsNear(dataset, center, radiusKm)) {
    try {
      const inter = turf.intersect(turf.featureCollection([buffer, w]));
      if (!inter) continue;
      const frac = turf.area(inter) / w.properties.area_sqm;
      total += w.properties.population * clamp(frac, 0, 1);
    } catch {
      // Degenerate geometry — skip.
    }
  }
  return Math.round(total);
}

/** Population density (people/km²) at a point = containing ward density. */
export function densityAt(dataset: CityDataset, p: [number, number]): number {
  const pt = turf.point(p);
  for (const w of dataset.wards.features) {
    if (turf.booleanPointInPolygon(pt, w)) return w.properties.population_density;
  }
  return 0;
}

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

function populationNeed(
  dataset: CityDataset,
  parcel: Parcel,
  spec: ProjectSpec,
  enriched: EnrichedParcel
): { score: number; pop: number; nearestNeedKm: number } {
  const pop = populationWithinKm(dataset, parcel.properties.centroid, spec.serviceRadiusKm);
  const popScore = norm(pop, 4000, 130000);
  if (!spec.needFacility) return { score: popScore, pop, nearestNeedKm: -1 };
  const nearestNeedKm = enriched.nearest[spec.needFacility];
  const gap = 100 - decayScore(nearestNeedKm, spec.serviceRadiusKm * 0.5, spec.serviceRadiusKm * 2.2);
  return { score: clamp(0.55 * popScore + 0.45 * gap), pop, nearestNeedKm };
}

export interface SuitabilityResult {
  parcel_id: string;
  breakdown: ScoreBreakdown;
  final: number;
  pop: number;
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
  if (spec.needFacility && need.nearestNeedKm > spec.serviceRadiusKm)
    pros.push(`Serves ~${need.pop.toLocaleString()} residents currently ${need.nearestNeedKm.toFixed(1)} km from a ${spec.label.toLowerCase()}`);
  else if (need.pop > 30000) pros.push(`High local demand — ~${need.pop.toLocaleString()} residents within ${spec.serviceRadiusKm} km`);
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
  weights?: Weights;
  limit?: number;
}

export function searchSites(dataset: CityDataset, req: SiteSearchRequest): {
  results: SuitabilityResult[];
  evaluated: number;
  eligible: number;
} {
  const spec = PROJECTS[req.project_type];
  const minHa = req.minimum_area_hectares ?? spec.minAreaHa;
  const weights = req.weights ?? DEFAULT_WEIGHTS;
  const limit = req.limit ?? 12;

  let eligible = 0;
  const scored: SuitabilityResult[] = [];
  for (const parcel of dataset.parcels.features) {
    const p = parcel.properties;
    if (p.area_sqm / 10_000 < minHa) continue;
    if (req.government_land && p.ownership !== "government") continue;
    if (req.low_flood_risk && p.flood_risk === "high") continue;
    const e = getEnriched(dataset).byId.get(p.id)!;
    if (req.max_road_distance_km != null && e.roadKm > req.max_road_distance_km) continue;
    eligible++;
    scored.push(suitabilityForParcel(dataset, parcel, req.project_type, weights));
  }
  scored.sort((a, b) => b.final - a.final);
  return { results: scored.slice(0, limit), evaluated: dataset.parcels.features.length, eligible };
}

// ---------------------------------------------------------------------------
// Parcel intelligence profile
// ---------------------------------------------------------------------------

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
    zoning: p.zoning,
    land_use: p.land_use,
    ward: p.ward,
    built_up_percent: p.built_up_percent,
    vegetation_percent: p.vegetation_percent,
    flood_risk: p.flood_risk,
    elevation_m: p.elevation_m,
    history: p.history,
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

export function infrastructureGaps(dataset: CityDataset): WardInfra[] {
  const out: WardInfra[] = [];
  for (const w of dataset.wards.features) {
    const c = w.properties.centroid;
    const perCap = (type: FacilityType, radius: number, good: number, bad: number) => {
      const nearest = nearestByType(dataset, c, type).km;
      const count = facilityCountWithinKm(dataset, c, type, radius);
      const per100k = (count / Math.max(w.properties.population, 1)) * 100_000;
      return clamp(0.6 * decayScore(nearest, good, bad) + 0.4 * norm(per100k, 0, 6));
    };
    const healthcare = clamp(0.6 * perCap("hospital", 6, 1.5, 7) + 0.4 * perCap("clinic", 3, 0.6, 2.5));
    const education = clamp(0.7 * perCap("school", 3, 0.8, 3) + 0.3 * perCap("college", 8, 2, 9));
    const parks = perCap("park", 2.5, 0.8, 2.5);
    const transportation = clamp(0.6 * perCap("bus_stop", 1.5, 0.3, 1.5) + 0.4 * perCap("metro_station", 6, 0.8, 6));
    const road_connectivity = decayScore(roadDistanceKm(dataset, c), 0.3, 2.5);
    const overall = clamp(
      0.3 * healthcare + 0.22 * education + 0.16 * parks + 0.22 * transportation + 0.1 * road_connectivity
    );
    out.push({
      ward_code: w.properties.ward_code,
      name: w.properties.name,
      population: w.properties.population,
      centroid: w.properties.centroid,
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
  const center = getCityConfig(dataset.cityId).center;
  const defs = [
    { name: "North-West Corridor", bearing: 320, risk: "Very High" },
    { name: "SP Ring Road South", bearing: 190, risk: "High" },
    { name: "Eastern Industrial Corridor", bearing: 95, risk: "High" },
  ];
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
