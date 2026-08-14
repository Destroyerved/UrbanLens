import * as turf from "@turf/turf";
import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import { CityConfig, DATA_SEED } from "@/lib/config";
import { loadRealData, loadRealWards } from "@/lib/data/real";
import { makeWardLocator } from "@/lib/gis/population";
import {
  mulberry32,
  Rng,
  randRange,
  randInt,
  pick,
  weightedPick,
  hashString,
} from "@/lib/rng";
import type {
  CityDataset,
  FacilityProps,
  FacilityType,
  LandUse,
  Ownership,
  ParcelProps,
  PredictionProps,
  RiskLevel,
  RoadProps,
  WardProps,
  Zoning,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Geometry helpers (kept local + cheap; heavy set ops use turf)
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos(lat * DEG);

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * DEG;
  const dLng = (b[0] - a[0]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Bearing in degrees (0=N, 90=E) from `from` to `to`. */
function bearingDeg(from: [number, number], to: [number, number]): number {
  const y = Math.sin((to[0] - from[0]) * DEG) * Math.cos(to[1] * DEG);
  const x =
    Math.cos(from[1] * DEG) * Math.sin(to[1] * DEG) -
    Math.sin(from[1] * DEG) * Math.cos(to[1] * DEG) * Math.cos((to[0] - from[0]) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Rectangle polygon centred at `c`, sized in metres, rotated by `rot` radians. */
function rectPolygon(
  c: [number, number],
  widthM: number,
  heightM: number,
  rot: number
): [number, number][] {
  const dxDeg = (m: number) => m / mPerDegLng(c[1]);
  const dyDeg = (m: number) => m / M_PER_DEG_LAT;
  const hw = widthM / 2;
  const hh = heightM / 2;
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  const ring = corners.map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [c[0] + dxDeg(rx), c[1] + dyDeg(ry)] as [number, number];
  });
  ring.push(ring[0]);
  return ring;
}

// ---------------------------------------------------------------------------
// Urban form: radial intensity field + anisotropic growth corridors
// ---------------------------------------------------------------------------

interface Corridor {
  name: string;
  bearing: number; // degrees
  width: number; // angular half-width for falloff
  reachKm: number; // how far built-up extends in this direction
}

const CORRIDORS: Corridor[] = [
  { name: "North-West Corridor", bearing: 320, width: 40, reachKm: 12.5 },
  { name: "SP Ring Road South", bearing: 190, width: 38, reachKm: 11 },
  { name: "Eastern Industrial Corridor", bearing: 95, width: 34, reachKm: 11 },
];

const BASE_REACH_KM = 7.2;

/** Returns { reach, corridorStrength } for a given bearing from centre. */
function corridorField(bearing: number): { reachKm: number; strength: number } {
  let reach = BASE_REACH_KM;
  let strength = 0;
  for (const c of CORRIDORS) {
    const g = Math.exp(-((angularDiff(bearing, c.bearing) / c.width) ** 2));
    reach += g * (c.reachKm - BASE_REACH_KM);
    strength = Math.max(strength, g);
  }
  return { reachKm: reach, strength };
}

function makeIntensityFn(config: CityConfig) {
  const center = config.center;
  return (lng: number, lat: number): number => {
    const p: [number, number] = [lng, lat];
    const d = haversineKm(center, p);
    const { reachKm } = corridorField(bearingDeg(center, p));
    const v = 100 * Math.exp(-((d / reachKm) ** 1.7));
    return Math.max(0, Math.min(100, v));
  };
}

// Sabarmati-style river: gentle N–S curve near the centre longitude.
function riverLine(config: CityConfig): [number, number][] {
  const [minLng, minLat, , maxLat] = config.bbox;
  const baseLng = config.center[0] - 0.01;
  const pts: [number, number][] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lat = minLat + t * (maxLat - minLat);
    const wob = 0.012 * Math.sin(t * Math.PI * 1.6) + 0.006 * Math.sin(t * Math.PI * 4);
    pts.push([baseLng + wob, lat]);
    void minLng;
  }
  return pts;
}

function distToRiverKm(p: [number, number], river: [number, number][]): number {
  const line = turf.lineString(river);
  return turf.pointToLineDistance(turf.point(p), line, { units: "kilometers" });
}

// ---------------------------------------------------------------------------
// Roads (arterials, ring road, radials) + metro alignment
// ---------------------------------------------------------------------------

function generateRoads(
  config: CityConfig,
  river: [number, number][]
): { roads: FeatureCollection<LineString, RoadProps>; metroLine: [number, number][] } {
  const center = config.center;
  const features: FeatureCollection<LineString, RoadProps>["features"] = [];

  const dLat = (km: number) => km / (M_PER_DEG_LAT / 1000);
  const dLng = (km: number) => km / (mPerDegLng(center[1]) / 1000);

  // Ring road (SP Ring Road) as a closed-ish loop of segments.
  const ringPts: [number, number][] = [];
  const ringR = 8.6;
  for (let i = 0; i <= 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    ringPts.push([
      center[0] + dLng(ringR) * Math.cos(ang),
      center[1] + dLat(ringR) * Math.sin(ang),
    ]);
  }
  features.push({
    type: "Feature",
    properties: { id: "road-ring", name: "SP Ring Road", road_type: "ring", importance: 0.95 },
    geometry: { type: "LineString", coordinates: ringPts },
  });

  // Radial arterials outward along key bearings.
  const radials: { name: string; bearing: number; km: number }[] = [
    { name: "SG Highway", bearing: 325, km: 12 },
    { name: "Sarkhej–Gandhinagar Rd", bearing: 200, km: 11 },
    { name: "NH-48 East", bearing: 95, km: 11 },
    { name: "Naroda Road", bearing: 55, km: 10 },
    { name: "Narol–Sarkhej Rd", bearing: 235, km: 10 },
    { name: "Ashram Road", bearing: 5, km: 9 },
  ];
  for (const r of radials) {
    const b = r.bearing * DEG;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const km = (i / 14) * r.km;
      pts.push([
        center[0] + dLng(km) * Math.sin(b),
        center[1] + dLat(km) * Math.cos(b),
      ]);
    }
    features.push({
      type: "Feature",
      properties: {
        id: `road-${r.name.replace(/\W+/g, "-").toLowerCase()}`,
        name: r.name,
        road_type: "arterial",
        importance: 0.8,
      },
      geometry: { type: "LineString", coordinates: pts },
    });
  }

  // River (rendered, but excluded from road-accessibility).
  features.push({
    type: "Feature",
    properties: { id: "river", name: "Sabarmati River", road_type: "river", importance: 0 },
    geometry: { type: "LineString", coordinates: river },
  });

  // Metro alignment (N–S through core, used to place metro stations).
  const metroLine: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const km = -9 + t * 18;
    metroLine.push([
      center[0] + dLng(km * 0.15),
      center[1] + dLat(km),
    ]);
  }

  return {
    roads: { type: "FeatureCollection", features },
    metroLine,
  };
}

// ---------------------------------------------------------------------------
// Wards — real municipal boundaries when available, else a tiled grid
// ---------------------------------------------------------------------------

const WARD_NAMES = [
  "Navrangpura", "Maninagar", "Bopal", "Chandkheda", "Sabarmati",
  "Naranpura", "Vastrapur", "Bodakdev", "Satellite", "Gota",
  "Vejalpur", "Ghatlodia", "Thaltej", "Ranip", "Nikol",
  "Vatva", "Isanpur", "Odhav", "Naroda", "Chandlodia",
  "Memnagar", "Paldi", "Ambawadi", "Jodhpur", "Makarba",
  "Sarkhej", "Juhapura", "Shahibaug", "Asarwa", "Bapunagar",
  "Ellisbridge", "Ghodasar", "Vasna", "Hansol", "Kubernagar",
];

function generateWards(
  config: CityConfig,
  rng: Rng,
  intensity: (lng: number, lat: number) => number
): FeatureCollection<Polygon, WardProps> {
  const [minLng, minLat, maxLng, maxLat] = config.bbox;
  const cell = 0.03; // ~3km tiles
  const ncols = Math.round((maxLng - minLng) / cell);
  const nrows = Math.round((maxLat - minLat) / cell);
  const cellLng = (maxLng - minLng) / ncols;
  const cellLat = (maxLat - minLat) / nrows;

  const features: FeatureCollection<Polygon, WardProps>["features"] = [];
  let nameIdx = 0;
  let code = 1;

  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const cLng = minLng + (c + 0.5) * cellLng;
      const cLat = minLat + (r + 0.5) * cellLat;
      const dKm = haversineKm(config.center, [cLng, cLat]);
      if (dKm > config.radiusKm * 1.02) continue;

      const ring: [number, number][] = [
        [minLng + c * cellLng, minLat + r * cellLat],
        [minLng + (c + 1) * cellLng, minLat + r * cellLat],
        [minLng + (c + 1) * cellLng, minLat + (r + 1) * cellLat],
        [minLng + c * cellLng, minLat + (r + 1) * cellLat],
        [minLng + c * cellLng, minLat + r * cellLat],
      ];
      const poly = turf.polygon([ring]);
      const areaSqm = turf.area(poly);
      const areaKm2 = areaSqm / 1e6;
      const it = intensity(cLng, cLat);
      const density = 2200 + (it / 100) * 21000 * randRange(rng, 0.75, 1.2);
      const population = Math.round(density * areaKm2);
      const name = WARD_NAMES[nameIdx % WARD_NAMES.length];
      nameIdx++;
      const wardCode = `AMC-${String(code).padStart(2, "0")}`;
      code++;

      features.push({
        type: "Feature",
        properties: {
          id: wardCode,
          name,
          ward_code: wardCode,
          district: config.name,
          population,
          area_sqm: Math.round(areaSqm),
          population_density: Math.round(density),
          centroid: [Number(cLng.toFixed(6)), Number(cLat.toFixed(6))],
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// Parcels
// ---------------------------------------------------------------------------

const GOV_OWNERS = [
  "AUDA", "State Government of Gujarat", "Ahmedabad Municipal Corporation",
  "Indian Railways", "Revenue Department", "Forest Department",
];
const PRIVATE_OWNERS = [
  "Private Individual", "Private Trust", "Cooperative Housing Society", "Corporate Entity",
];

function officialZoning(dKm: number, radiusKm: number, rng: Rng): Zoning {
  const ratio = dKm / radiusKm;
  if (ratio < 0.25)
    return weightedPick(rng, [
      ["commercial", 3], ["residential", 4], ["mixed_use", 2], ["public_semi_public", 1],
    ]);
  if (ratio < 0.55)
    return weightedPick(rng, [
      ["residential", 5], ["mixed_use", 2], ["public_semi_public", 1],
      ["commercial", 1], ["recreational", 1],
    ]);
  if (ratio < 0.8)
    return weightedPick(rng, [
      ["residential", 3], ["agricultural", 3], ["industrial", 2], ["recreational", 1],
    ]);
  return weightedPick(rng, [
    ["agricultural", 6], ["industrial", 2], ["residential", 1], ["recreational", 1],
  ]);
}

function actualLandUse(intensity: number, rng: Rng): LandUse {
  if (intensity > 68)
    return weightedPick<LandUse>(rng, [
      ["residential", 5], ["commercial", 3], ["mixed", 2], ["institutional", 1],
    ]);
  if (intensity > 42)
    return weightedPick<LandUse>(rng, [
      ["residential", 5], ["mixed", 2], ["institutional", 1], ["vacant", 1], ["industrial", 1],
    ]);
  if (intensity > 22)
    return weightedPick<LandUse>(rng, [
      ["residential", 2], ["vacant", 3], ["agriculture", 3], ["industrial", 1], ["green", 1],
    ]);
  return weightedPick<LandUse>(rng, [
    ["agriculture", 5], ["vacant", 3], ["green", 2], ["residential", 1],
  ]);
}

function generateParcels(
  config: CityConfig,
  rng: Rng,
  wards: FeatureCollection<Polygon, WardProps>,
  intensity: (lng: number, lat: number) => number,
  river: [number, number][]
): FeatureCollection<Polygon, ParcelProps> {
  const features: FeatureCollection<Polygon, ParcelProps>["features"] = [];
  let seq = 1;

  for (const ward of wards.features) {
    const [minLng, minLat, maxLng, maxLat] = turf.bbox(ward) as [
      number, number, number, number,
    ];
    const wardIntensity = intensity(ward.properties.centroid[0], ward.properties.centroid[1]);
    // Real wards vary enormously in size (33 km² on the fringe vs ~2 km² in the
    // core), so parcel counts scale with ward area to keep sampling density even.
    const areaKm2 = ward.properties.area_sqm / 1e6;
    const count = Math.max(
      6,
      Math.round(areaKm2 * randRange(rng, 3.2, 5.2) * (0.6 + wardIntensity / 130))
    );

    for (let i = 0; i < count; i++) {
      // Rejection-sample a point that actually falls inside the ward polygon.
      // Real boundaries are irregular, so a bbox sample is not enough; give up
      // after a bounded number of tries and fall back to the centroid.
      let lng = 0;
      let lat = 0;
      let inside = false;
      for (let attempt = 0; attempt < 24 && !inside; attempt++) {
        lng = randRange(rng, minLng, maxLng);
        lat = randRange(rng, minLat, maxLat);
        inside = turf.booleanPointInPolygon([lng, lat], ward);
      }
      if (!inside) {
        [lng, lat] = ward.properties.centroid;
      }
      const c: [number, number] = [lng, lat];
      const dKm = haversineKm(config.center, c);

      const baseIt = intensity(lng, lat);
      const localIt = Math.max(0, Math.min(100, baseIt + randRange(rng, -12, 12)));
      const landUse = actualLandUse(localIt, rng);

      // Government share: higher for institutional use + a mild central bias.
      const govProb =
        (landUse === "institutional" ? 0.55 : 0.14) + (dKm < 5 ? 0.06 : 0) + 0.04;
      const ownership: Ownership = rng() < govProb ? "government" : "private";

      // Area: government + fringe parcels are larger; core private plots small.
      const big = ownership === "government" || dKm > config.radiusKm * 0.6;
      const acres = big
        ? randRange(rng, 2, 24) ** (rng() < 0.3 ? 1.1 : 1)
        : randRange(rng, 0.2, 4.5);
      const areaSqm = acres * 4046.86;
      const aspect = randRange(rng, 0.6, 1.6);
      const w = Math.sqrt(areaSqm * aspect);
      const h = areaSqm / w;
      const ring = rectPolygon(c, w, h, randRange(rng, 0, Math.PI));

      let builtUp: number;
      if (landUse === "vacant" || landUse === "agriculture" || landUse === "green") {
        builtUp = Math.max(0, Math.round(randRange(rng, 0, 18)));
      } else if (landUse === "residential" || landUse === "mixed") {
        builtUp = Math.round(Math.max(20, Math.min(95, localIt + randRange(rng, -8, 12))));
      } else {
        builtUp = Math.round(Math.max(10, Math.min(90, localIt + randRange(rng, -10, 10))));
      }
      const veg =
        landUse === "agriculture"
          ? Math.round(randRange(rng, 55, 85))
          : Math.round(Math.max(2, Math.min(70, (100 - builtUp) * randRange(rng, 0.3, 0.6))));
      const water = Math.round(Math.max(0, randRange(rng, 0, 6)));

      // Flood risk: near river + low intensity fringe (poor drainage) → higher.
      const riverKm = distToRiverKm(c, river);
      const elevation = Math.round(48 + (lng - config.center[0]) * 60 + randRange(rng, -4, 6));
      let flood: RiskLevel = "low";
      if (riverKm < 0.9) flood = "high";
      else if (riverKm < 2.0 || elevation < 44) flood = "medium";

      const zoning = officialZoning(dKm, config.radiusKm, rng);

      // Growth history: fringe + corridor parcels urbanised fastest.
      const { strength } = corridorField(bearingDeg(config.center, c));
      const fringe = Math.exp(-(((localIt - 45) / 26) ** 2)); // peak at mid intensity
      const totalGrowth = Math.round(
        (fringe * 22 + strength * 11) * randRange(rng, 0.5, 1.15)
      );
      const bu2026 = builtUp;
      const bu2018 = Math.max(0, bu2026 - totalGrowth);
      const bu2022 = Math.max(bu2018, Math.round(bu2018 + (bu2026 - bu2018) * 0.62));

      const parcelId = `GJ-${config.code}-${String(seq).padStart(5, "0")}`;
      features.push({
        type: "Feature",
        properties: {
          id: parcelId,
          parcel_id: parcelId,
          survey_number: `${randInt(rng, 1, 999)}/${randInt(rng, 1, 40)}`,
          area_sqm: Math.round(areaSqm),
          area_acres: Number(acres.toFixed(2)),
          ownership,
          owner_category: ownership === "government" ? pick(rng, GOV_OWNERS) : pick(rng, PRIVATE_OWNERS),
          land_use: landUse,
          zoning,
          district: config.name,
          ward: ward.properties.ward_code,
          built_up_percent: bu2026,
          vegetation_percent: veg,
          water_percent: water,
          flood_risk: flood,
          elevation_m: elevation,
          centroid: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
          history: { 2018: bu2018, 2022: bu2022, 2026: bu2026 },
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
      seq++;
    }
  }
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// Facilities (clustered toward built-up areas; gaps emerge in the fringe)
// ---------------------------------------------------------------------------

const FACILITY_PLAN: { type: FacilityType; count: number; bias: number; cap: [number, number] }[] = [
  { type: "hospital", count: 14, bias: 2.4, cap: [80, 600] },
  { type: "clinic", count: 46, bias: 1.6, cap: [8, 40] },
  { type: "school", count: 58, bias: 1.4, cap: [200, 1600] },
  { type: "college", count: 11, bias: 2.0, cap: [800, 5000] },
  { type: "park", count: 24, bias: 0.7, cap: [1, 50] },
  { type: "fire_station", count: 8, bias: 1.8, cap: [4, 12] },
  { type: "police_station", count: 13, bias: 1.5, cap: [20, 80] },
  { type: "bus_stop", count: 95, bias: 1.2, cap: [1, 1] },
  { type: "government_office", count: 18, bias: 2.2, cap: [10, 120] },
];

function generateFacilities(
  config: CityConfig,
  rng: Rng,
  intensity: (lng: number, lat: number) => number,
  metroLine: [number, number][]
): FeatureCollection<Point, FacilityProps> {
  const [minLng, minLat, maxLng, maxLat] = config.bbox;
  const features: FeatureCollection<Point, FacilityProps>["features"] = [];
  let seq = 1;

  for (const plan of FACILITY_PLAN) {
    let placed = 0;
    let guard = 0;
    while (placed < plan.count && guard < plan.count * 60) {
      guard++;
      const lng = randRange(rng, minLng, maxLng);
      const lat = randRange(rng, minLat, maxLat);
      if (haversineKm(config.center, [lng, lat]) > config.radiusKm) continue;
      const it = intensity(lng, lat) / 100;
      // Accept probability favours built-up areas by `bias`; parks tolerate green.
      const accept = Math.pow(0.15 + it, plan.bias);
      if (rng() > accept) continue;
      features.push(makeFacility(plan.type, seq++, [lng, lat], plan.cap, rng));
      placed++;
    }
  }

  // Metro stations evenly along the alignment.
  const metroCount = 14;
  const line = turf.lineString(metroLine);
  const len = turf.length(line, { units: "kilometers" });
  for (let i = 0; i < metroCount; i++) {
    const along = turf.along(line, (len * (i + 0.5)) / metroCount, { units: "kilometers" });
    const coord = along.geometry.coordinates as [number, number];
    features.push(makeFacility("metro_station", seq++, coord, [1, 1], rng));
  }

  return { type: "FeatureCollection", features };
}

const AREA_TAGS = ["West", "East", "North", "South", "Central", "New", "Civil", "Ring", "GIDC", "Riverfront"];

function makeFacility(
  type: FacilityType,
  seq: number,
  coord: [number, number],
  cap: [number, number],
  rng: Rng
): FeatureCollection<Point, FacilityProps>["features"][number] {
  const nameByType: Record<FacilityType, string> = {
    hospital: `${pick(rng, AREA_TAGS)} General Hospital`,
    clinic: `${pick(rng, AREA_TAGS)} Health Clinic`,
    school: `${pick(rng, AREA_TAGS)} Public School`,
    college: `${pick(rng, AREA_TAGS)} College`,
    park: `${pick(rng, AREA_TAGS)} Park`,
    fire_station: `${pick(rng, AREA_TAGS)} Fire Station`,
    police_station: `${pick(rng, AREA_TAGS)} Police Station`,
    bus_stop: `Bus Stop ${seq}`,
    metro_station: `${pick(rng, AREA_TAGS)} Metro`,
    government_office: `${pick(rng, AREA_TAGS)} Govt. Office`,
  };
  return {
    type: "Feature",
    properties: {
      id: `F-${String(seq).padStart(4, "0")}`,
      name: nameByType[type],
      facility_type: type,
      capacity: randInt(rng, cap[0], cap[1]),
      source: "OpenStreetMap (demo)",
    },
    geometry: { type: "Point", coordinates: [Number(coord[0].toFixed(6)), Number(coord[1].toFixed(6))] },
  };
}

// ---------------------------------------------------------------------------
// 2030 growth prediction grid (explainable logistic model)
// ---------------------------------------------------------------------------

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function riskCategory(p: number): PredictionProps["risk_category"] {
  if (p < 0.2) return "very_low";
  if (p < 0.4) return "low";
  if (p < 0.6) return "medium";
  if (p < 0.8) return "high";
  return "very_high";
}

function generatePrediction(
  config: CityConfig,
  intensity: (lng: number, lat: number) => number,
  roads: FeatureCollection<LineString, RoadProps>,
  wards: FeatureCollection<Polygon, WardProps>
): FeatureCollection<Polygon, PredictionProps> {
  // Cover the actual ward footprint, which with real boundaries is wider than
  // the nominal city bbox.
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(wards) as [number, number, number, number];
  // Cells are kept only where they fall inside a ward, so the prediction surface
  // follows the true municipal outline instead of a circle around the centre.
  const inCity = makeWardLocator(wards.features);
  const step = 0.008; // ~0.85km cells
  const arterialVerts: [number, number][] = [];
  for (const r of roads.features) {
    if (r.properties.road_type === "river") continue;
    for (const c of r.geometry.coordinates) arterialVerts.push(c as [number, number]);
  }
  const nearestRoadKm = (p: [number, number]): number => {
    let m = Infinity;
    for (const v of arterialVerts) {
      const d = haversineKm(p, v);
      if (d < m) m = d;
    }
    return m;
  };
  const features: FeatureCollection<Polygon, PredictionProps>["features"] = [];
  let seq = 1;

  for (let lat = minLat; lat < maxLat; lat += step) {
    for (let lng = minLng; lng < maxLng; lng += step) {
      const cx = lng + step / 2;
      const cy = lat + step / 2;
      if (inCity(cx, cy) < 0) continue;

      const it = intensity(cx, cy);
      const { strength } = corridorField(bearingDeg(config.center, [cx, cy]));
      const fringe = Math.exp(-(((it - 42) / 18) ** 2)); // urban-fringe peak
      const roadKm = nearestRoadKm([cx, cy]);
      const roadProx = Math.exp(-roadKm / 1.1); // 0..1, near roads → 1
      const saturated = Math.max(0, (it - 80) / 20);

      const z =
        -2.7 +
        2.5 * fringe +
        1.9 * strength +
        0.85 * roadProx +
        0.35 * (it / 100) -
        3.4 * saturated;
      const prob = Math.max(0.01, Math.min(0.99, sigmoid(z)));

      const ring: [number, number][] = [
        [lng, lat],
        [lng + step, lat],
        [lng + step, lat + step],
        [lng, lat + step],
        [lng, lat],
      ];
      features.push({
        type: "Feature",
        properties: {
          id: `P-${seq++}`,
          prediction_year: 2030,
          growth_probability: Number(prob.toFixed(3)),
          risk_category: riskCategory(prob),
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

export function generateCity(config: CityConfig): CityDataset {
  const rng = mulberry32(DATA_SEED ^ hashString(config.id));
  const intensity = makeIntensityFn(config);
  const river = riverLine(config);

  // Real layers override the synthetic ones whenever their cache exists:
  //   - wards      → scripts/build-wards.mjs (digitised municipal ward map)
  //   - facilities → scripts/fetch-osm.mjs   (OpenStreetMap via Overpass)
  //   - roads      → scripts/fetch-osm.mjs
  // Parcels stay synthetic: GLIS cadastral records are not public, and the PRD
  // explicitly permits realistic demo parcels provided they are labelled.
  const real = loadRealData(config.id);
  const realWards = loadRealWards(config.id);

  const { roads: synthRoads, metroLine } = generateRoads(config, river);
  const roads = real?.roads ?? synthRoads;
  const wards = realWards?.wards ?? generateWards(config, rng, intensity);
  const parcels = generateParcels(config, rng, wards, intensity, river);
  const facilities = real?.facilities ?? generateFacilities(config, rng, intensity, metroLine);
  const prediction = generatePrediction(config, intensity, roads, wards);

  const sources: CityDataset["sources"] = {
    wards: realWards
      ? {
          source: "official",
          label: `${config.name} municipal ward map`,
          detail: `${realWards.meta.wards} digitised ward boundaries (${realWards.meta.area_km2} km²) with measured area, perimeter, compactness and OSM road density.`,
        }
      : {
          source: "synthetic",
          label: "Synthetic ward grid",
          detail: "Uniform tiles generated over the city bbox — structure only, not real boundaries.",
        },
    population: realWards
      ? {
          source: "derived",
          label: "Modelled from census totals",
          detail: `${realWards.meta.population_basis}; ${realWards.meta.population_method}. Estimates, not ward-level census counts.`,
        }
      : {
          source: "synthetic",
          label: "Synthetic population",
          detail: "Density modelled from the generated urban-intensity field.",
        },
    parcels: {
      source: "synthetic",
      label: "Demo parcels (not GLIS)",
      detail:
        "Deterministically generated cadastral-style parcels standing in for GLIS records, which are not publicly available. Structure and spatial behaviour are realistic; the records are not official.",
    },
    facilities: real?.facilities
      ? {
          source: "osm",
          label: "OpenStreetMap",
          detail: `${real.facilities.features.length} facilities via the Overpass API, de-duplicated and re-classified (fetched ${real.meta.fetchedAt.slice(0, 10) || "n/a"}).`,
        }
      : { source: "synthetic", label: "Synthetic facilities", detail: "Generated and clustered toward built-up areas." },
    roads: real?.roads
      ? {
          source: "osm",
          label: "OpenStreetMap",
          detail: `${real.roads.features.length} major road segments via the Overpass API, geometry decimated for spatial math.`,
        }
      : { source: "synthetic", label: "Synthetic road network", detail: "Generated radial + ring arterial network." },
    prediction: {
      source: "derived",
      label: "Growth model output",
      detail:
        "Per-cell 2030 growth probability from a transparent weighted model over distance-to-road, distance-to-built-up, distance-to-centre and current land use.",
    },
  };

  // City boundary = union of the ward polygons (the true municipal footprint
  // when the ward layer is official).
  let hull: CityDataset["boundary"];
  try {
    hull =
      (turf.union(wards as never) as CityDataset["boundary"]) ??
      (turf.bboxPolygon(config.bbox as [number, number, number, number]) as CityDataset["boundary"]);
  } catch {
    hull = turf.bboxPolygon(config.bbox as [number, number, number, number]) as CityDataset["boundary"];
  }

  return {
    cityId: config.id,
    generatedAt: new Date().toISOString(),
    sources,
    boundary: hull as CityDataset["boundary"],
    wards,
    parcels,
    facilities,
    roads,
    prediction,
  };
}
