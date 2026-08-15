/**
 * Convert the REAL municipal ward boundaries in <repo>/refined/ into the compact
 * ward layer the web app consumes at runtime.
 *
 * Run: `node scripts/build-wards.mjs`
 *
 * Inputs (real, produced by the dataset pipeline in <repo>/scripts):
 *   refined/<city>_wards_full.geojson
 *     - real ward polygons digitised from the municipal ward map
 *     - real derived attributes: area_m2, perimeter_m, compactness,
 *       centroid_lon/lat, road_length_km, road_density_km_per_km2
 *       (road metrics are measured against the OSM road network)
 *
 * Output: web/data/engine/<city>_wards.json
 *
 * WHAT IS REAL vs DERIVED — this distinction is load-bearing for the product,
 * so it is recorded in the output file and surfaced in the UI:
 *   REAL     ward geometry, name, area, perimeter, compactness, road length,
 *            road density.
 *   DERIVED  population and population_density. Ward-level census counts are not
 *            in this repo, so population is *modelled*: the municipality's total
 *            population is distributed across wards in proportion to
 *              area_km2 x road_density^ALPHA
 *            Road density is a real, measured proxy for urban intensity, which
 *            makes the split defensible and fully deterministic — but these are
 *            estimates, NOT census figures, and must never be presented as such.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");
const REFINED = join(REPO, "refined");
const OUT = join(__dirname, "..", "data", "engine");

/**
 * Exponent applied to road density when allocating population. 1.35 reproduces
 * roughly a 15x density spread between the least and most road-dense ward,
 * which matches the observed spread of real Indian metro ward densities.
 */
const ALPHA = 1.35;

const CITIES = [
  {
    id: "ahmedabad",
    file: "ahmedabad_wards_full.geojson",
    prefix: "AMC",
    district: "Ahmedabad",
    /**
     * Ahmedabad Municipal Corporation area only (the 48 wards in this file),
     * not the wider urban agglomeration. AMC recorded 5,570,585 in Census 2011;
     * ~7.2M is the standard ~2.3%/yr projection to 2026.
     */
    population: 7_200_000,
    populationBasis: "AMC Census 2011 (5,570,585) projected to 2026 at ~2.3%/yr",
  },
  {
    id: "gandhinagar",
    file: "gandhinagar_wards_full.geojson",
    prefix: "GMC",
    district: "Gandhinagar",
    /** GMC recorded 208,299 in Census 2011; ~350k is the projection to 2026. */
    population: 350_000,
    populationBasis: "GMC Census 2011 (208,299) projected to 2026",
  },
];

/** Source polygons carry a redundant Z ordinate; turf/MapLibre want [lng, lat]. */
function strip2d(coords) {
  if (typeof coords[0] === "number") return [coords[0], coords[1]];
  return coords.map(strip2d);
}

/** Ring area via the shoelace formula — sign gives winding direction. */
function signedArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return s / 2;
}

/** GeoJSON (RFC 7946) wants counter-clockwise exterior rings, clockwise holes. */
function wind(coords) {
  return coords.map((ring, i) => {
    const ccw = signedArea(ring) < 0;
    const want = i === 0 ? ccw : !ccw;
    return want ? ring : [...ring].reverse();
  });
}

function build(city) {
  const src = JSON.parse(readFileSync(join(REFINED, city.file), "utf8"));
  const feats = src.features;

  // Allocation weights from REAL measured attributes.
  const weights = feats.map((f) => {
    const p = f.properties;
    return p.area_km2 * Math.pow(Math.max(p.road_density_km_per_km2, 0.1), ALPHA);
  });
  const wSum = weights.reduce((a, b) => a + b, 0);

  const features = feats.map((f, i) => {
    const p = f.properties;
    const wardCode = `${city.prefix}-${String(p.ward_id).padStart(2, "0")}`;
    const population = Math.round(city.population * (weights[i] / wSum));
    const areaKm2 = p.area_km2;

    // Title-case the source names, which are upper-case in the ward map.
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
        district: city.district,
        population,
        area_sqm: Math.round(p.area_m2),
        population_density: Math.round(population / areaKm2),
        centroid: [Number(p.centroid_lon.toFixed(6)), Number(p.centroid_lat.toFixed(6))],
        // Real measured attributes carried through for analysis + display.
        road_length_km: p.road_length_km,
        road_density: p.road_density_km_per_km2,
        compactness: Number(p.compactness.toFixed(4)),
        perimeter_km: Number(p.perimeter_km.toFixed(3)),
      },
      geometry: {
        type: "Polygon",
        coordinates: wind(strip2d(f.geometry.coordinates)),
      },
    };
  });

  // Extent of the real wards — the app uses this to size the analysis window.
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const f of features) {
    for (const ring of f.geometry.coordinates) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  const out = {
    type: "FeatureCollection",
    features,
    meta: {
      cityId: city.id,
      source: `${city.district} municipal ward map (digitised) + OSM-measured road network`,
      wards: features.length,
      area_km2: Number(features.reduce((a, f) => a + f.properties.area_sqm, 0) / 1e6).toFixed(1),
      bbox: [minLng, minLat, maxLng, maxLat].map((v) => Number(v.toFixed(4))),
      real_fields: [
        "geometry", "name", "area_sqm", "perimeter_km",
        "compactness", "road_length_km", "road_density",
      ],
      derived_fields: ["population", "population_density"],
      population_total: city.population,
      population_basis: city.populationBasis,
      population_method: `total distributed by area_km2 x road_density^${ALPHA}`,
      builtAt: new Date().toISOString(),
    },
  };

  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${city.id}_wards.json`);
  writeFileSync(path, JSON.stringify(out));

  const dens = features.map((f) => f.properties.population_density).sort((a, b) => a - b);
  console.log(
    `${city.id}: ${features.length} wards, ${out.meta.area_km2} km², ` +
      `density ${dens[0].toLocaleString()}–${dens[dens.length - 1].toLocaleString()}/km² ` +
      `→ ${path.replace(REPO, ".")}`
  );
  console.log(`   bbox ${JSON.stringify(out.meta.bbox)}`);
}

for (const city of CITIES) build(city);
