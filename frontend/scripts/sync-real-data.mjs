/**
 * Pull real city data from the UrbanLens spatial engine (../web) into this app.
 *
 *   npm run sync:data                       # against http://localhost:3000
 *   URBANLENS_API=http://localhost:3111 npm run sync:data
 *   URBANLENS_CITY=ahmedabad-metro npm run sync:data
 *
 * WHY A BUILD-TIME SYNC RATHER THAN RUNTIME FETCHES:
 * every analysis function in lib/analysis.ts is synchronous and reads the
 * module-level arrays in data/. Converting those to async would ripple through
 * the whole component tree for no user-visible gain. Writing the same shapes to
 * data/real/*.json instead lets the entire app — map, gap analysis, site search,
 * simulator, copilot — run unchanged on real boundaries and real parcels.
 *
 * The generated files are what this app loads when present; the seeded
 * generators in data/*.ts remain as the fallback, so the demo still runs with no
 * engine available.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "real");

const API = (process.env.URBANLENS_API ?? "http://localhost:3000").replace(/\/$/, "");
const CITY = process.env.URBANLENS_CITY ?? "ahmedabad";

async function get(path) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}city=${encodeURIComponent(CITY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

/** The engine's land-use vocabulary → this app's. */
const LAND_USE = {
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
const ZONING = {
  residential: "residential",
  commercial: "commercial",
  industrial: "industrial",
  agricultural: "agriculture",
  public_semi_public: "public",
  recreational: "vegetation",
  mixed_use: "mixed",
};

const FACILITY = {
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

/**
 * Built-up share is the only per-year signal the engine records, so land use per
 * year is reconstructed from it: a parcel below the built-up threshold in an
 * earlier year is treated as having been undeveloped then. Present-day land use
 * is real; the earlier years are inferred, which is what the Time Machine needs
 * and no more than the engine itself claims.
 */
function landUseByYear(props, current) {
  const undeveloped = current === "water" || current === "vegetation" ? current : "vacant";
  const at = (built) => (built >= 25 ? current : undeveloped);
  return { 2018: at(props.h2018), 2022: at(props.h2022), 2026: current };
}

function outerRing(geometry) {
  // Parcels are Polygon; take the exterior ring. MultiPolygon → largest part.
  if (geometry.type === "Polygon") return geometry.coordinates[0];
  let best = null;
  let bestLen = -1;
  for (const poly of geometry.coordinates) {
    if (poly[0].length > bestLen) {
      bestLen = poly[0].length;
      best = poly[0];
    }
  }
  return best ?? [];
}

const round = (n, d = 2) => Number(Number(n).toFixed(d));

// ---------------------------------------------------------------------------

console.log(`→ ${API}  ·  city=${CITY}`);
mkdirSync(OUT, { recursive: true });

// --- wards -----------------------------------------------------------------
const wardsFC = await get("/api/wards");
const wards = wardsFC.features.map((f) => {
  const p = f.properties;
  const pop = p.population;
  return {
    id: p.ward_code,
    name: p.name,
    ring: outerRing(f.geometry).map(([lng, lat]) => [round(lng, 6), round(lat, 6)]),
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
  };
});
writeFileSync(join(OUT, "wards.json"), JSON.stringify(wards));
console.log(`  wards       ${wards.length}`);

// --- parcels ---------------------------------------------------------------
const parcelsFC = await get("/api/parcels?detail=full");
const parcels = parcelsFC.features.map((f) => {
  const p = f.properties;
  const landUse = LAND_USE[p.land_use] ?? "vacant";
  return {
    id: p.parcel_id,
    surveyNumber: p.survey_number ?? "—",
    wardId: p.ward,
    centroid: p.centroid,
    ring: outerRing(f.geometry).map(([lng, lat]) => [round(lng, 6), round(lat, 6)]),
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
  };
});
writeFileSync(join(OUT, "parcels.json"), JSON.stringify(parcels));
console.log(`  parcels     ${parcels.length}`);

// --- facilities ------------------------------------------------------------
const facFC = await get("/api/facilities");
const facilities = facFC.features
  .map((f) => {
    const type = FACILITY[f.properties.facility_type];
    if (!type) return null;
    const [lng, lat] = f.geometry.coordinates;
    return {
      id: f.properties.id,
      name: f.properties.name,
      type,
      coord: [round(lng, 6), round(lat, 6)],
    };
  })
  .filter(Boolean);
writeFileSync(join(OUT, "facilities.json"), JSON.stringify(facilities));
console.log(`  facilities  ${facilities.length}`);

// --- roads -----------------------------------------------------------------
const roadsFC = await get("/api/roads");
const roads = roadsFC.features
  .filter((f) => f.properties.road_type !== "river")
  .map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    path: f.geometry.coordinates.map(([lng, lat]) => [round(lng, 6), round(lat, 6)]),
  }));
writeFileSync(join(OUT, "roads.json"), JSON.stringify(roads));
console.log(`  roads       ${roads.length}`);

// --- provenance ------------------------------------------------------------
const health = await get("/api/health");
writeFileSync(
  join(OUT, "meta.json"),
  JSON.stringify(
    {
      city: CITY,
      api: API,
      syncedAt: new Date().toISOString(),
      counts: { wards: wards.length, parcels: parcels.length, facilities: facilities.length, roads: roads.length },
      sources: health.sources,
    },
    null,
    2
  )
);

console.log(`✓ wrote ${OUT}`);
console.log("  Restart `npm run dev` — data/*.ts prefer these files when present.");
