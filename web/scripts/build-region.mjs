/**
 * Compose the Ahmedabad–Gandhinagar twin-city region from the two municipal
 * datasets already staged in data/engine/.
 *
 * Run after build-wards.mjs and fetch-osm.mjs:
 *   node scripts/build-region.mjs
 *
 * The corridor between the two cities — GIFT City, Adalaj, the SG Highway
 * spine — is where the metropolitan area is actually growing, and it is invisible
 * when each municipality is analysed on its own. Merging them gives one planning
 * surface across the whole conurbation.
 *
 * WHY MERGE RATHER THAN RE-FETCH: the two OSM bboxes already overlap, and every
 * feature carries a stable OSM id. De-duplicating on that id reconstructs the
 * region exactly, with no extra load on the public Overpass API and no risk of a
 * timeout on a bbox twice the size.
 *
 * Population is NOT pooled and re-split. Each municipality's own total stays
 * distributed within its own wards, which is more accurate than spreading a
 * combined figure across boundaries with very different densities (AMC ~16,300
 * people/km², GMC ~1,800).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "data", "engine");

const REGION_ID = "ahmedabad-gandhinagar";
const PARTS = ["ahmedabad", "gandhinagar"];

function read(city, name) {
  const p = join(DIR, `${city}_${name}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Merge FeatureCollections, keeping the first feature seen for each id. */
function mergeFC(collections, idOf) {
  const seen = new Set();
  const features = [];
  let duplicates = 0;
  for (const fc of collections) {
    if (!fc) continue;
    for (const f of fc.features) {
      const id = idOf(f);
      if (id != null && seen.has(id)) {
        duplicates++;
        continue;
      }
      if (id != null) seen.add(id);
      features.push(f);
    }
  }
  return { fc: { type: "FeatureCollection", features }, duplicates };
}

function bboxOf(features) {
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
  for (const f of features) walk(f.geometry.coordinates);
  return [minLng, minLat, maxLng, maxLat].map((v) => Number(v.toFixed(4)));
}

// --- wards ------------------------------------------------------------------
// Ward codes are already municipality-prefixed (AMC-01, GMC-01), so they cannot
// collide and each ward keeps its own population allocation.
const wardSources = PARTS.map((c) => read(c, "wards"));
for (let i = 0; i < PARTS.length; i++) {
  if (!wardSources[i]) {
    console.error(`! missing ${PARTS[i]}_wards.json — run build-wards.mjs first`);
    process.exit(1);
  }
}
const { fc: wards, duplicates: wardDupes } = mergeFC(wardSources, (f) => f.properties.ward_code);
const totalPop = wards.features.reduce((s, f) => s + f.properties.population, 0);
const totalArea = wards.features.reduce((s, f) => s + f.properties.area_sqm, 0) / 1e6;

writeFileSync(
  join(DIR, `${REGION_ID}_wards.json`),
  JSON.stringify({
    ...wards,
    meta: {
      cityId: REGION_ID,
      source: "Ahmedabad + Gandhinagar municipal ward maps (digitised) + OSM-measured road network",
      composedFrom: PARTS,
      wards: wards.features.length,
      area_km2: totalArea.toFixed(1),
      bbox: bboxOf(wards.features),
      real_fields: ["geometry", "name", "area_sqm", "perimeter_km", "compactness", "road_length_km", "road_density"],
      derived_fields: ["population", "population_density"],
      population_total: totalPop,
      population_basis: PARTS.map((c) => wardSources[PARTS.indexOf(c)].meta.population_basis).join(" ; "),
      population_method:
        "each municipality's own census total distributed within its own wards by area_km2 x road_density^1.35, then the two ward sets combined",
      builtAt: new Date().toISOString(),
    },
  })
);
console.log(
  `wards: ${wards.features.length} (${wardDupes} dupes) · ${totalArea.toFixed(1)} km² · ${totalPop.toLocaleString()} people`
);

// --- OSM layers -------------------------------------------------------------
// The two fetch bboxes overlap, so the same OSM feature can appear in both
// files. Stable OSM ids make the de-duplication exact.
for (const layer of ["facilities", "roads", "land"]) {
  const sources = PARTS.map((c) => read(c, layer));
  if (sources.every((s) => !s)) {
    console.warn(`! no ${layer} in either city — skipping`);
    continue;
  }
  const { fc, duplicates } = mergeFC(sources, (f) => f.properties.id);
  writeFileSync(join(DIR, `${REGION_ID}_${layer}.json`), JSON.stringify(fc));
  console.log(`${layer}: ${fc.features.length} (${duplicates} duplicates removed)`);
}

// --- meta -------------------------------------------------------------------
const metas = PARTS.map((c) => read(c, "meta")).filter(Boolean);
writeFileSync(
  join(DIR, `${REGION_ID}_meta.json`),
  JSON.stringify(
    {
      fetchedAt: metas.map((m) => m.fetchedAt).sort().pop() ?? new Date().toISOString(),
      bbox: bboxOf(wards.features).join(","),
      source: "OpenStreetMap via Overpass API (merged from Ahmedabad + Gandhinagar)",
      composedFrom: PARTS,
    },
    null,
    2
  )
);

console.log(`✓ ${REGION_ID} → ${DIR}`);
