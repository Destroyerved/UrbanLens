/**
 * Compose the ward layer for every Gujarat district — REAL wards where a
 * digitised municipal source exists, taluka fill everywhere else.
 *
 *   node scripts/build-districts.mjs            # all 34 districts
 *   node scripts/build-districts.mjs kutch      # one district
 *
 * ── TIERED WARDS ────────────────────────────────────────────────────────────
 * The finest real administrative unit per district:
 *   · Ahmedabad   → 48 AMC wards (refined/ahmedabad_wards_full.geojson)
 *   · Gandhinagar → GMC wards (refined/gandhinagar_wards_full.geojson)
 *   · every other district → its OSM talukas (the only real unit available)
 * where a municipality's real wards exist, the talukas around them are clipped
 * to their non-municipal remainder so nothing is counted twice.
 *
 * ── POPULATION (all derived, none invented) ─────────────────────────────────
 * Ward districts:
 *   wards    = municipal Census 2011 × GROWTH, split by area × road_density^1.35
 *   talukas  = (district 2011 − municipal 2011) × GROWTH, uniform density
 * Taluka-only districts:
 *   talukas  = district 2026 (from gujarat_config.json), uniform density
 * The per-unit sum always equals the district 2026 total from the config, so
 * the composite ("gujarat") reconciles to the official state total by
 * construction.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as turf from "@turf/turf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");
const REFINED = join(REPO, "refined");
const ENGINE = join(__dirname, "..", "data", "engine");

/** Same growth factor as the existing pipeline (rural/peri-urban, 2001–2011). */
const GROWTH = 1.196;
/** Clipped remnants below this are boundary slivers, not places. */
const MIN_REMNANT_KM2 = 5;
/** Exponent applied to road density when splitting municipal population. */
const ALPHA = 1.35;

/** Municipal corporations with a digitised real-ward source. */
const MUNICIPAL = {
  Ahmedabad: {
    id: "ahmedabad",
    file: "ahmedabad_wards_full.geojson",
    prefix: "AMC",
    population2011: 5_570_585, // Census 2011
  },
  Gandhinagar: {
    id: "gandhinagar",
    file: "gandhinagar_wards_full.geojson",
    prefix: "GMC",
    population2011: 208_299, // Census 2011
  },
};

function read(name) {
  return JSON.parse(readFileSync(join(ENGINE, `${name}.json`), "utf8"));
}

function strip2d(coords) {
  if (typeof coords[0] === "number") return [coords[0], coords[1]];
  return coords.map(strip2d);
}

/** Signed ring area — sign gives winding direction. */
function signedArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return s / 2;
}

/** GeoJSON (RFC 7946): CCW exterior rings, CW holes. */
function wind(coords) {
  return coords.map((ring, i) => {
    const ccw = signedArea(ring) < 0;
    const want = i === 0 ? ccw : !ccw;
    return want ? ring : [...ring].reverse();
  });
}

function polygonOf(feature) {
  const g = feature.geometry;
  if (g.type === "Polygon") {
    return { type: "Polygon", coordinates: wind(strip2d(g.coordinates)) };
  }
  if (g.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: g.coordinates.map(wind) };
  }
  throw new Error(`unexpected geometry ${g.type}`);
}

function centroidOf(geom) {
  return turf.centroid({ type: "Feature", geometry: geom }).geometry.coordinates;
}

/** Municipal ward features with the same shape as build-wards.mjs. */
function buildWards(municipal, districtName, pop2026) {
  const src = JSON.parse(readFileSync(join(REFINED, municipal.file), "utf8"));
  const feats = src.features;
  const weights = feats.map((f) => {
    const p = f.properties;
    return p.area_km2 * Math.pow(Math.max(p.road_density_km_per_km2, 0.1), ALPHA);
  });
  const wSum = weights.reduce((a, b) => a + b, 0);

  const features = feats.map((f, i) => {
    const p = f.properties;
    const wardCode = `${municipal.prefix}-${String(p.ward_id).padStart(2, "0")}`;
    const population = Math.round(pop2026 * (weights[i] / wSum));
    const areaKm2 = p.area_km2;
    const name = String(p.name)
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/\bNo -\s*/i, "No. ");
    return {
      type: "Feature",
      properties: {
        id: wardCode,
        name,
        ward_code: wardCode,
        district: districtName,
        population,
        area_sqm: Math.round(p.area_m2),
        population_density: Math.round(population / areaKm2),
        centroid: [Number(p.centroid_lon.toFixed(6)), Number(p.centroid_lat.toFixed(6))],
        road_length_km: p.road_length_km,
        road_density: p.road_density_km_per_km2,
        compactness: Number(p.compactness.toFixed(4)),
        perimeter_km: Number(p.perimeter_km.toFixed(3)),
        kind: "ward",
        admin_level: 8,
      },
      geometry: { type: "Polygon", coordinates: wind(strip2d(f.geometry.coordinates)) },
    };
  });
  return features;
}

function buildDistrict(district, config, talukas) {
  const dPoly = polygonOf(district);
  const areaKm2 = turf.area({ type: "Feature", geometry: dPoly }) / 1e6;
  const district2011 = config.population_2011;
  const pop2026 = config.population;

  // Talukas that actually belong to this district (centroid test).
  const mine = talukas.filter((t) => {
    const c = turf.centroid({ type: "Feature", geometry: polygonOf(t) });
    return turf.booleanPointInPolygon(c, { type: "Feature", geometry: dPoly });
  });

  const units = [];
  const municipal = MUNICIPAL[district.properties.name];
  const districtFeature = { type: "Feature", properties: {}, geometry: dPoly };

  /** The part of a taluka that actually lies inside this district. */
  function insideDistrict(t) {
    try {
      const hit = turf.intersect(
        turf.featureCollection([
          { type: "Feature", properties: {}, geometry: polygonOf(t) },
          districtFeature,
        ])
      );
      return hit && hit.geometry ? hit : null;
    } catch {
      return null;
    }
  }

  if (municipal) {
    // Real municipal wards + taluka remnants clipped around them.
    const wardFeatures = buildWards(municipal, district.properties.name, municipal.population2011 * GROWTH);
    const municipalUnion = turf.union(turf.featureCollection(wardFeatures));
    const municipalKm2 = turf.area(municipalUnion) / 1e6;
    const periKm2 = Math.max(areaKm2 - municipalKm2, 1);
    const periPop2026 = (district2011 - municipal.population2011) * GROWTH;
    const perKm2 = periPop2026 / periKm2;
    const wardSum = wardFeatures.reduce((s, f) => s + f.properties.population, 0);

    for (const w of wardFeatures) units.push(w);

    let assigned = wardSum;
    for (const t of mine) {
      const inDist = insideDistrict(t);
      if (!inDist) continue;
      let remnant;
      try {
        // turf v7 `difference` takes a FeatureCollection: first minus the rest.
        const diff = turf.difference(
          turf.featureCollection([inDist, municipalUnion])
        );
        remnant = diff && !diff.geometry ? null : diff;
      } catch {
        remnant = null;
      }
      if (!remnant || !remnant.geometry) continue;
      const remKm2 = turf.area(remnant) / 1e6;
      if (remKm2 < MIN_REMNANT_KM2) continue;

      const geometry = remnant.geometry;
      const code = `TAL-${t.properties.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}`;
      units.push({
        type: "Feature",
        properties: {
          id: code,
          name: `${t.properties.name} (rural)`,
          ward_code: code,
          district: district.properties.name,
          population: Math.round(remKm2 * perKm2),
          area_sqm: Math.round(remKm2 * 1e6),
          population_density: Math.round(perKm2),
          centroid: centroidOf(geometry).map((v) => Number(v.toFixed(6))),
          kind: "taluka",
          admin_level: 6,
          osm_id: t.properties.id,
        },
        geometry,
      });
    }

    // Reconcile exactly to the district total (last remnant absorbs rounding).
    const excess = pop2026 - units.reduce((s, f) => s + f.properties.population, 0);
    const fill = units.filter((f) => f.properties.kind === "taluka");
    if (fill.length) fill[fill.length - 1].properties.population += excess;
    else units[0].properties.population += excess;
  } else {
    // Taluka fill for the whole district at uniform density.
    const perKm2 = pop2026 / areaKm2;
    let assigned = 0;
    for (const t of mine) {
      const clipped = insideDistrict(t);
      if (!clipped) continue;
      const geometry = clipped.geometry;
      const km2 = turf.area({ type: "Feature", geometry }) / 1e6;
      if (km2 < MIN_REMNANT_KM2) continue;
      const code = `TAL-${t.properties.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}`;
      units.push({
        type: "Feature",
        properties: {
          id: code,
          name: t.properties.name,
          ward_code: code,
          district: district.properties.name,
          population: Math.round(km2 * perKm2),
          area_sqm: Math.round(km2 * 1e6),
          population_density: Math.round(perKm2),
          centroid: centroidOf(geometry).map((v) => Number(v.toFixed(6))),
          kind: "taluka",
          admin_level: 6,
          osm_id: t.properties.id,
        },
        geometry,
      });
      assigned += Math.round(km2 * perKm2);
    }
    // Reconcile exactly (last unit absorbs rounding).
    const excess = pop2026 - assigned;
    if (units.length) units[units.length - 1].properties.population += excess;
  }

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
  for (const f of units) walk(f.geometry.coordinates);

  const totalArea = units.reduce((s, f) => s + f.properties.area_sqm, 0) / 1e6;
  const totalPop = units.reduce((s, f) => s + f.properties.population, 0);
  const nWard = units.filter((f) => f.properties.kind === "ward").length;
  const nTalu = units.filter((f) => f.properties.kind === "taluka").length;

  const basis = municipal
    ? `Municipal wards: ${municipal.population2011.toLocaleString()} (Census 2011) × ${GROWTH}. Talukas: ${district.properties.name} district ${district2011.toLocaleString()} (Census 2011) minus municipal, uniform density.`
    : `${district.properties.name} district ${district2011.toLocaleString()} (Census 2011) × ${GROWTH}, uniform density across talukas.`;

  const doc = {
    type: "FeatureCollection",
    features: units,
    meta: {
      cityId: config.id,
      source: municipal
        ? `${municipal.prefix} municipal ward map (digitised) + OSM taluka boundaries (admin_level=6)`
        : "OSM taluka boundaries (admin_level=6)",
      wards: units.length,
      municipal_units: nWard,
      taluka_units: nTalu,
      area_km2: Number(totalArea.toFixed(1)),
      bbox: [minLng, minLat, maxLng, maxLat].map((v) => Number(v.toFixed(4))),
      real_fields: ["geometry", "name", "area_sqm"],
      derived_fields: ["population", "population_density"],
      population_total: totalPop,
      population_basis: basis,
      population_method: municipal
        ? `municipal total split by area_km2 x road_density^${ALPHA}; peri-urban remainder at uniform district density x ${GROWTH}`
        : `uniform district density x ${GROWTH}`,
      builtAt: new Date().toISOString(),
    },
  };

  const path = join(ENGINE, `${config.id}_wards.json`);
  writeFileSync(path, JSON.stringify(doc));
  console.log(
    `${config.id.padEnd(20)} ${nWard} wards + ${nTalu} talukas · ` +
      `${totalArea.toFixed(0).padStart(5)} km² · ${totalPop.toLocaleString().padStart(11)} people ` +
      `(target ${pop2026.toLocaleString()})`
  );
  return totalPop;
}

const boundaries = read("gujarat_boundaries");
const gujarat = read("gujarat_config");
const districts = boundaries.features.filter((f) => f.properties.kind === "district");
const talukas = boundaries.features.filter((f) => f.properties.kind === "taluka");

const byName = new Map(districts.map((d) => [d.properties.name, d]));
const requested = process.argv.slice(2);
const targets = requested.length
  ? gujarat.districts.filter((d) => requested.includes(d.id))
  : gujarat.districts;

mkdirSync(ENGINE, { recursive: true });

let grand = 0;
for (const cfg of targets) {
  const d = byName.get(cfg.name);
  if (!d) {
    console.error(`! no boundary for ${cfg.name}`);
    continue;
  }
  grand += buildDistrict(d, cfg, talukas);
}

const statePop = gujarat.gujarat.population;
const ok = Math.abs(grand - statePop) <= Math.max(1, grand * 0.0001);
console.log(
  `\n${targets.length} districts · ${grand.toLocaleString()} people total ` +
    `(state 2026 target ${statePop.toLocaleString()}) ${ok ? "✓ reconciled" : "⚠ MISMATCH"}`
);