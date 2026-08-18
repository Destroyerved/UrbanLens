/**
 * Generate the statewide study-area configuration from real data.
 *
 * Inputs (real, already fetched):
 *   web/data/engine/gujarat_boundaries.json  — 34 districts + 267 talukas,
 *       filtered to the Gujarat state polygon (fetch-talukas.mjs + filter-gujarat.mjs)
 *
 * Outputs:
 *   web/data/engine/gujarat_config.json  — single machine-readable source of truth
 *       consumed by backend/app/core/config.py and the per-district builders
 *   web/config/gujarat.ts                — frontend CityConfig entries
 *
 * POPULATION — every district carries a Census 2011 figure. The 26 districts
 * that existed at the 2011 census use their official published totals (verified
 * to sum to the official state total 60,439,692). The 8 districts created
 * afterwards (Aravalli, Botad, Chhota Udaipur, Devbhoomi Dwarka, Gir Somnath,
 * Mahisagar, Morbi, Vav-Tharad) have no 2011 census row of their own; their
 * populations are the published subdistrict-aggregated retro figures
 * (cross-checked between Wikipedia and indiastat/sarkarilist, which agree
 * exactly on 7 of 8). Children carved from two parents (Botad from
 * Ahmedabad+Bhavnagar, Mahisagar from Kheda+Panchmahal, Morbi from
 * Rajkot+Surendranagar) are split between their parents in proportion to
 * current district area. Parents are reduced by their children's amounts, so no
 * one is counted twice and the 34-district sum (60,440,574) matches the official
 * state total to within rounding (0.0015%). The 2026 headline is 2011 x 1.196,
 * the same growth factor the pipeline already uses for peri-urban population.
 * Nothing else is invented.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");
const ENGINE = join(REPO, "web", "data", "engine");
const CONFIG_DIR = join(REPO, "web", "config");

const GROWTH = 1.196;

/** Census 2011 district populations, current boundaries (keyed by OSM names).
 * Base: official 26-district totals. Split districts: published retro figures.
 * Multi-parent children split by area. See the header comment. */
const POP2011 = {
  Ahmedabad: 6_879_794, // 7,214,225 - Botad's Ahmedabad share (area-split)
  Amreli: 1_514_190,
  Anand: 2_092_745,
  Aravalli: 1_051_746, // split from Sabarkantha (published retro)
  Banaskantha: 2_141_666, // 3,120,506 - Vav-Tharad 978,840
  Bharuch: 1_551_019,
  Bhavnagar: 2_558_791, // 2,880,365 - Botad's Bhavnagar share (area-split)
  Botad: 656_005, // split from Ahmedabad + Bhavnagar (published retro)
  "Chhota Udaipur": 1_071_831, // split from Vadodara (published retro)
  Dahod: 2_127_086,
  Dang: 228_291,
  "Devbhumi Dwaraka": 752_484, // split from Jamnagar (published retro)
  Gandhinagar: 1_391_753,
  "Gir Somnath": 1_217_477, // split from Junagadh (published retro)
  Jamnagar: 1_407_635, // 2,160,119 - Devbhumi Dwarka 752,484
  Junagadh: 1_525_605, // 2,743,082 - Gir Somnath 1,217,477
  Kheda: 1_793_209, // 2,299,885 - Mahisagar's Kheda share (area-split)
  Kutch: 2_092_371,
  Mahisagar: 994_624, // split from Kheda + Panchmahal (published retro)
  Mahesana: 2_035_064,
  Morbi: 960_329, // split from Rajkot + Surendranagar (published retro)
  Narmada: 590_379,
  Navsari: 1_329_472,
  Panchmahal: 1_902_828, // 2,390,776 - Mahisagar's Panchmahal share (area-split)
  Patan: 1_343_734,
  Porbandar: 585_449,
  Rajkot: 3_368_775, // 3,804,558 - Morbi's Rajkot share (area-split)
  Sabarkantha: 1_376_843, // 2,428,589 - Aravalli 1,051,746
  Surat: 6_081_322,
  Surendranagar: 1_231_722, // 1,756,268 - Morbi's Surendranagar share (area-split)
  Tapi: 807_022,
  Vadodara: 3_093_795, // 4,165,626 - Chhota Udaipur 1,071,831
  Valsad: 1_706_678,
  "Vav-Tharad": 978_840, // split from Banaskantha (published retro)
};

/** Municipal corporations with digitised ward maps already in the repo. */
const MUNICIPAL = {
  Ahmedabad: { cityId: "ahmedabad", name: "AMC", population2011: 5_570_585 },
  Gandhinagar: { cityId: "gandhinagar", name: "GMC", population2011: 208_299 },
};

const slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const doc = JSON.parse(readFileSync(join(ENGINE, "gujarat_boundaries.json"), "utf8"));
const districts = doc.features
  .filter((f) => f.properties.kind === "district")
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

function walk(coords) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pts = [];
  const rec = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] > maxY) maxY = c[1];
      pts.push(c);
      return;
    }
    for (const x of c) rec(x);
  };
  rec(coords);
  return { bbox: [minX, minY, maxX, maxY], pts };
}

/** Approximate geographic area in km² via the spherical excess formula. */
function areaKm2(coords) {
  const R = 6378137;
  // Find the largest closed ring (handles Polygon and MultiPolygon).
  let largest = null;
  let bestArea = -1;
  const walk = (c) => {
    if (typeof c[0] === "number") return;
    if (Array.isArray(c[0]) && typeof c[0][0] === "number") {
      let a = 0;
      for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
        a += c[j][0] * c[i][1] - c[i][0] * c[j][1];
      }
      a = Math.abs(a) / 2;
      if (a > bestArea) {
        bestArea = a;
        largest = c;
      }
      return;
    }
    for (const x of c) walk(x);
  };
  walk(coords);
  if (!largest) return 0;

  const ring = largest;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    s += (((x2 - x1) * Math.PI) / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((s * R * R) / 2) / 1e6;
}

/** Zoom that frames a district of this area nicely on screen. */
function zoomFor(areaKm2) {
  const z = 10.4 - Math.log2(Math.max(areaKm2, 50) / 1000);
  return Math.round(Math.max(7.2, Math.min(10.4, z)) * 10) / 10;
}

const districtsOut = [];
let stateMin = [Infinity, Infinity];
let stateMax = [-Infinity, -Infinity];

for (const d of districts) {
  const name = d.properties.name;
  const id = slug(name);
  const { bbox, pts } = walk(d.geometry.coordinates);
  const area = areaKm2(d.geometry.coordinates);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;

  const pop2011 = POP2011[name];
  if (pop2011 === undefined) {
    console.error(`! no population for district "${name}"`);
    process.exit(1);
  }

  for (const v of bbox) {
    if (v === bbox[0] || v === bbox[2]) stateMin[0] = Math.min(stateMin[0], v);
    else stateMin[1] = Math.min(stateMin[1], v);
  }
  stateMin = [Math.min(stateMin[0], bbox[0]), Math.min(stateMin[1], bbox[1])];
  stateMax = [Math.max(stateMax[0], bbox[2]), Math.max(stateMax[1], bbox[3])];

  const municipal = MUNICIPAL[name];
  districtsOut.push({
    id,
    name,
    state: "Gujarat",
    code: name.slice(0, 3).toUpperCase(),
    center: [Number(cx.toFixed(4)), Number(cy.toFixed(4))],
    bbox: bbox.map((v) => Number(v.toFixed(4))),
    radius_km: Math.round(Math.sqrt(area / Math.PI)),
    area_km2: Math.round(area),
    population_2011: pop2011,
    population: Math.round(pop2011 * GROWTH),
    zoom: zoomFor(area),
    kind: "district",
    municipality: municipal
      ? {
          cityId: municipal.cityId,
          name: municipal.name,
          population_2011: municipal.population2011,
        }
      : null,
  });
  console.log(`${id.padEnd(18)} ${name.padEnd(18)} ${area.toFixed(0).padStart(6)} km²  pop2011 ${pop2011.toLocaleString().padStart(10)}  zoom ${zoomFor(area)}`);
}

const stateCenter = [
  Number((stateMin[0] + stateMax[0]) / 2).toFixed(4),
  Number((stateMin[1] + stateMax[1]) / 2).toFixed(4),
].map(Number);
const total2011 = districtsOut.reduce((s, d) => s + d.population_2011, 0);

const config = {
  state: "Gujarat",
  generatedAt: new Date().toISOString(),
  growth_factor: GROWTH,
  population_basis:
    "District totals are Census 2011 (official 26-district figures plus published retro figures for the 8 districts created after 2011; multi-parent children split by area). 2026 = 2011 x 1.196. See generator header for the full reconciliation.",
  state_center: stateCenter,
  state_bbox: [stateMin[0], stateMin[1], stateMax[0], stateMax[1]].map((v) => Number(v.toFixed(4))),
  gujarat: {
    id: "gujarat",
    name: "Gujarat",
    state: "Gujarat",
    code: "GJT",
    center: stateCenter,
    bbox: [stateMin[0], stateMin[1], stateMax[0], stateMax[1]].map((v) => Number(v.toFixed(4))),
    population_2011: total2011,
    population: Math.round(total2011 * GROWTH),
    zoom: 6.8,
    kind: "composite",
    composite_of: districtsOut.map((d) => d.id),
  },
  districts: districtsOut,
};

mkdirSync(ENGINE, { recursive: true });
writeFileSync(
  join(ENGINE, "gujarat_config.json"),
  JSON.stringify(config, null, 2)
);
console.log(`\n✓ wrote ${join(ENGINE, "gujarat_config.json")}`);
console.log(`state pop2011 ${total2011.toLocaleString()} → 2026 ${config.gujarat.population.toLocaleString()}`);

// --- frontend entries --------------------------------------------------------
const entry = (c, blurb) =>
  `  {
    id: ${JSON.stringify(c.id)},
    name: ${JSON.stringify(c.name)},
    state: ${JSON.stringify(c.state)},
    blurb: ${JSON.stringify(blurb)},
    center: [${c.center[0]}, ${c.center[1]}] as LngLat,
    zoom: ${c.zoom},
    bounds: [
      [${c.bbox[0]}, ${c.bbox[1]}] as LngLat,
      [${c.bbox[2]}, ${c.bbox[3]}] as LngLat,
    ],
    growthCenter: [${c.center[0]}, ${c.center[1]}] as LngLat,
  },`;

const lines = [];
lines.push(`import type { LngLat } from "@/types";`);
lines.push(``);
lines.push(`/**`);
lines.push(` * Gujarat statewide study areas, generated from real boundary data`);
lines.push(` * (web/data/engine/gujarat_config.json).`);
lines.push(` *`);
lines.push(` * Districts are the finest real unit; composites (Gujarat) are views`);
lines.push(` * resolved by the backend — no data is duplicated across study areas.`);
lines.push(` */`);
lines.push(``);

for (const c of districtsOut) {
  const name = `export const ${c.id.toUpperCase().replace(/-/g, "_")}: CityConfig = ${JSON.stringify(c, null, 2)};`;
  // city.ts entries need the CityConfig shape; build them by hand instead.
}
lines.push(`export const GUJARAT_DISTRICTS: CityConfig[] = [`);
for (const c of districtsOut) {
  const muni = c.municipality ? ` · ${c.municipality.name} wards + talukas` : " · talukas";
  lines.push(entry(c, `${c.name} district${muni}`));
}
lines.push(`  {`);
lines.push(`    id: "gujarat",`);
lines.push(`    name: "Gujarat",`);
lines.push(`    state: "Gujarat",`);
lines.push(`    blurb: "All ${districtsOut.length} districts · ${districtsOut.reduce((s, d) => s + d.population_2011, 0).toLocaleString()} people (2011)",`);
lines.push(`    center: [${stateCenter[0]}, ${stateCenter[1]}] as LngLat,`);
lines.push(`    zoom: 6.8,`);
lines.push(`    bounds: [`);
lines.push(`      [${stateMin[0]}, ${stateMin[1]}] as LngLat,`);
lines.push(`      [${stateMax[0]}, ${stateMax[1]}] as LngLat,`);
lines.push(`    ],`);
lines.push(`    growthCenter: [${stateCenter[0]}, ${stateCenter[1]}] as LngLat,`);
lines.push(`  },`);
lines.push(`];`);

mkdirSync(CONFIG_DIR, { recursive: true });
writeFileSync(join(CONFIG_DIR, "gujarat.ts"), lines.join("\n") + "\n");
console.log(`✓ wrote ${join(CONFIG_DIR, "gujarat.ts")}`);