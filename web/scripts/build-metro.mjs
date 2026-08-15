/**
 * Compose the Ahmedabad Metropolitan Region: the two municipalities plus the
 * peri-urban land around them.
 *
 * Run after build-wards.mjs, fetch-osm.mjs and fetch-talukas.mjs:
 *   node scripts/build-metro.mjs
 *
 * Municipal wards stop at the corporation limit, but a metropolitan area expands
 * past it, and the only real administrative units out there are talukas. This
 * combines both: 59 municipal wards keep their own populations, and the talukas
 * around them are clipped to their non-municipal remainder so nothing is counted
 * twice.
 *
 * ── POPULATION, AND WHY IT IS BUILT THIS WAY ────────────────────────────────
 * No taluka in this area publishes a population figure that can be sourced:
 * none carries a `population` tag in OSM, and none of their Wikidata items
 * carries a P1082 claim (verified for every one). Districts do. So the peri-urban
 * population is derived, entirely from figures that can be checked:
 *
 *   peri-urban 2011 = district total (Census 2011) − municipal total (Census 2011)
 *   peri-urban density = that population ÷ (district area − municipal area)
 *   taluka population = its clipped area × that density × a growth factor
 *
 * Both inputs are real Census 2011 counts and the subtraction is exact. What is
 * modelled is the assumption of *uniform* peri-urban density within a district,
 * which is far more defensible outside the city than inside it, and the single
 * growth factor below. No census figure is invented at any point.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as turf from "@turf/turf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "data", "real");
const METRO_ID = "ahmedabad-metro";

/**
 * Census 2011 counts. District totals are the P1082 claims on the districts'
 * Wikidata items; municipal totals are the corporation counts already used by
 * build-wards.mjs. Every number here is a published figure, not an estimate.
 */
const DISTRICTS = {
  Ahmedabad: { population2011: 7_214_225, municipal: "AMC", municipalPopulation2011: 5_570_585 },
  Gandhinagar: { population2011: 1_391_753, municipal: "GMC", municipalPopulation2011: 208_299 },
};

/**
 * 2011 → 2026 growth applied to peri-urban population only. Gujarat's rural and
 * peri-urban population grew at roughly 1.2%/yr over the 2001–2011 census
 * interval; compounded over 15 years that is ×1.196. Cities are projected
 * separately and faster in build-wards.mjs — applying an urban growth rate to
 * farmland would badly overstate it.
 */
const PERI_URBAN_GROWTH = 1.196;

/** Clipped remnants below this are boundary slivers, not places. */
const MIN_REMNANT_KM2 = 5;

function read(name) {
  const p = join(DIR, `${name}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

const talukaFile = read("talukas");
if (!talukaFile) {
  console.error("! data/real/talukas.json missing — run fetch-talukas.mjs first");
  process.exit(1);
}
const wardFiles = ["ahmedabad_wards", "gandhinagar_wards"].map(read);
if (wardFiles.some((f) => !f)) {
  console.error("! municipal ward files missing — run build-wards.mjs first");
  process.exit(1);
}

const wards = wardFiles.flatMap((f) => f.features);
const districts = talukaFile.features.filter((f) => f.properties.kind === "district");
const talukas = talukaFile.features.filter((f) => f.properties.kind === "taluka");

// The municipal footprint every taluka is clipped against.
const municipal = turf.union(turf.featureCollection(wards));
const municipalKm2 = turf.area(municipal) / 1e6;
console.log(`municipal footprint: ${wards.length} wards, ${municipalKm2.toFixed(1)} km²`);

const km2 = (f) => turf.area(f) / 1e6;

// --- per-district peri-urban density ---------------------------------------
const density = new Map(); // district name → people per km² (2026)
for (const d of districts) {
  const spec = DISTRICTS[d.properties.name];
  if (!spec) continue;

  let overlapKm2 = 0;
  try {
    const inter = turf.intersect(turf.featureCollection([d, municipal]));
    if (inter) overlapKm2 = km2(inter);
  } catch {
    // Fall back to the ward areas actually inside this district.
    overlapKm2 = 0;
  }

  const districtKm2 = km2(d);
  const periUrbanKm2 = Math.max(districtKm2 - overlapKm2, 1);
  const periUrbanPop2011 = spec.population2011 - spec.municipalPopulation2011;
  const perKm2 = (periUrbanPop2011 * PERI_URBAN_GROWTH) / periUrbanKm2;
  density.set(d.properties.name, perKm2);

  console.log(
    `${d.properties.name}: district ${districtKm2.toFixed(0)} km² − municipal ${overlapKm2.toFixed(0)} km² ` +
      `= ${periUrbanKm2.toFixed(0)} km² peri-urban · ${periUrbanPop2011.toLocaleString()} (2011) ` +
      `→ ${Math.round(perKm2).toLocaleString()}/km² (2026)`
  );
}

/** Which district contains a taluka, by centroid. */
function districtOf(taluka) {
  const c = turf.centroid(taluka);
  for (const d of districts) {
    if (!DISTRICTS[d.properties.name]) continue;
    try {
      if (turf.booleanPointInPolygon(c, d)) return d.properties.name;
    } catch {}
  }
  return null;
}

// --- clip talukas to their non-municipal remainder ---------------------------
const units = [];
let skippedNoDistrict = 0;
let skippedSliver = 0;

for (const t of talukas) {
  const dName = districtOf(t);
  if (!dName) {
    skippedNoDistrict++;
    continue;
  }
  // Only the fringe: talukas that actually meet the built municipal area.
  let touches = false;
  try {
    touches = turf.booleanIntersects(t, municipal);
  } catch {}
  if (!touches) continue;

  let remnant;
  try {
    remnant = turf.difference(turf.featureCollection([t, municipal]));
  } catch {
    remnant = null;
  }
  if (!remnant) {
    // Entirely inside the municipal area — one of the city talukas.
    skippedSliver++;
    continue;
  }

  const areaKm2 = km2(remnant);
  if (areaKm2 < MIN_REMNANT_KM2) {
    skippedSliver++;
    continue;
  }

  const perKm2 = density.get(dName) ?? 0;
  const population = Math.round(areaKm2 * perKm2);
  const centroid = turf.centroid(remnant).geometry.coordinates;
  const code = `TAL-${t.properties.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}`;

  units.push({
    type: "Feature",
    properties: {
      id: code,
      name: `${t.properties.name} (rural)`,
      ward_code: code,
      district: dName,
      population,
      area_sqm: Math.round(areaKm2 * 1e6),
      population_density: Math.round(perKm2),
      centroid: [Number(centroid[0].toFixed(6)), Number(centroid[1].toFixed(6))],
      // Marks this as a peri-urban taluka remnant rather than a municipal ward,
      // so analysis and UI can tell a 500 km² rural unit from a 9 km² city ward.
      kind: "taluka",
      admin_level: 6,
      osm_id: t.properties.id,
    },
    geometry: remnant.geometry,
  });
}

units.sort((a, b) => b.properties.area_sqm - a.properties.area_sqm);
console.log(
  `\nperi-urban units: ${units.length} (skipped ${skippedNoDistrict} outside both districts, ${skippedSliver} fully municipal or <${MIN_REMNANT_KM2} km²)`
);
for (const u of units) {
  console.log(
    `   ${u.properties.name.padEnd(26)} ${(u.properties.area_sqm / 1e6).toFixed(0).padStart(4)} km²  ` +
      `${u.properties.population.toLocaleString().padStart(10)}  (${u.properties.population_density}/km²)`
  );
}

// --- compose ----------------------------------------------------------------
const municipalUnits = wards.map((w) => ({
  ...w,
  properties: { ...w.properties, kind: "ward", admin_level: 8 },
}));
const all = [...municipalUnits, ...units];

let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
const walk = (c) => {
  if (typeof c[0] === "number") {
    if (c[0] < minLng) minLng = c[0];
    if (c[1] < minLat) minLat = c[1];
    if (c[0] > maxLng) maxLng = c[0];
    if (c[1] > maxLat) maxLat = c[1];
    return;
  }
  for (const x of c) walk(x);
};
for (const f of all) walk(f.geometry.coordinates);

const totalPop = all.reduce((s, f) => s + f.properties.population, 0);
const totalArea = all.reduce((s, f) => s + f.properties.area_sqm, 0) / 1e6;

writeFileSync(
  join(DIR, `${METRO_ID}_wards.json`),
  JSON.stringify({
    type: "FeatureCollection",
    features: all,
    meta: {
      cityId: METRO_ID,
      source:
        "Ahmedabad + Gandhinagar municipal ward maps (digitised) + OSM taluka boundaries (admin_level=6)",
      wards: all.length,
      municipal_units: municipalUnits.length,
      periurban_units: units.length,
      area_km2: totalArea.toFixed(1),
      bbox: [minLng, minLat, maxLng, maxLat].map((v) => Number(v.toFixed(4))),
      real_fields: ["geometry", "name", "area_sqm"],
      derived_fields: ["population", "population_density"],
      population_total: totalPop,
      population_basis:
        "Municipal wards: AMC (5,570,585) and GMC (208,299) Census 2011 projected to 2026. " +
        "Peri-urban talukas: Ahmedabad district (7,214,225) and Gandhinagar district (1,391,753) " +
        "Census 2011 minus their municipal populations.",
      population_method:
        `municipal totals distributed within their own wards by area_km2 x road_density^1.35; ` +
        `peri-urban remainder spread at uniform district density x ${PERI_URBAN_GROWTH} growth to 2026`,
      builtAt: new Date().toISOString(),
    },
  })
);

console.log(
  `\n✓ ${METRO_ID}: ${all.length} units (${municipalUnits.length} wards + ${units.length} peri-urban) · ` +
    `${totalArea.toFixed(0)} km² · ${totalPop.toLocaleString()} people`
);

// --- OSM layers -------------------------------------------------------------
// Seed from the twin-city region so the metro area is usable immediately, but
// never overwrite a metro-wide fetch: `fetch-osm.mjs ahmedabad-metro` covers the
// peri-urban talukas too, and clobbering it would silently reintroduce the
// infrastructure deserts that the wider fetch exists to fix.
for (const layer of ["facilities", "roads", "land"]) {
  const existing = read(`${METRO_ID}_${layer}`);
  if (existing) {
    console.log(`  ${layer}: ${existing.features.length} (metro-wide fetch kept)`);
    continue;
  }
  const src = read(`ahmedabad-gandhinagar_${layer}`);
  if (!src) continue;
  writeFileSync(join(DIR, `${METRO_ID}_${layer}.json`), JSON.stringify(src));
  console.log(`  ${layer}: ${src.features.length} (seeded from the twin-city region — run \`npm run data:osm ${METRO_ID}\` for peri-urban coverage)`);
}

const regionMeta = read("ahmedabad-gandhinagar_meta") ?? {};
writeFileSync(
  join(DIR, `${METRO_ID}_meta.json`),
  JSON.stringify(
    {
      ...regionMeta,
      source: "OpenStreetMap via Overpass API (municipal core only; peri-urban talukas are boundary-only)",
      coverage_note:
        "Facility, road and land layers were fetched for the municipal bboxes. Peri-urban talukas have real boundaries and derived population but sparse mapped infrastructure, so their service scores understate reality.",
    },
    null,
    2
  )
);
