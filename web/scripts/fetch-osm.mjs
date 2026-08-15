/**
 * Fetch REAL city infrastructure from OpenStreetMap via the Overpass API and
 * cache it to web/data/real/.
 *
 *   node scripts/fetch-osm.mjs             # every configured city
 *   node scripts/fetch-osm.mjs ahmedabad   # one city
 *
 * Facilities + major roads + rivers become authoritative "real" layers; parcels
 * remain synthetic demo data.
 *
 * The query bbox is derived from the REAL ward extent (data/real/<city>_wards.json,
 * produced by build-wards.mjs) and padded outward. This matters: a bbox tighter
 * than the municipal boundary leaves edge wards with no facilities at all, which
 * shows up as a fake "infrastructure desert" in the gap analysis. Run
 * build-wards.mjs before this script.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "real");
mkdirSync(OUT, { recursive: true });

/**
 * Padding beyond the ward extent, in degrees (~3 km). Facilities just outside
 * the boundary still serve residents inside it, so the catchment math needs them.
 */
const PAD = 0.03;

/** Fallback extents used when a city has no built ward file yet. */
const FALLBACK_BBOX = {
  ahmedabad: [72.4493, 22.9139, 72.7015, 23.1405],
  gandhinagar: [72.5408, 23.0883, 72.7008, 23.3113],
};

function bboxFor(cityId) {
  const wardFile = join(OUT, `${cityId}_wards.json`);
  let ext;
  if (existsSync(wardFile)) {
    ext = JSON.parse(readFileSync(wardFile, "utf8")).meta.bbox;
  } else if (FALLBACK_BBOX[cityId]) {
    ext = FALLBACK_BBOX[cityId];
    console.warn(`! ${cityId}: no ward file, using fallback extent`);
  } else {
    throw new Error(`no ward file or fallback extent for "${cityId}"`);
  }
  const [minLng, minLat, maxLng, maxLat] = ext;
  // Overpass wants south,west,north,east.
  return [
    (minLat - PAD).toFixed(4),
    (minLng - PAD).toFixed(4),
    (maxLat + PAD).toFixed(4),
    (maxLng + PAD).toFixed(4),
  ].join(",");
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let lastErr;
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`→ querying ${url} (attempt ${attempt})`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "UrbanLens/1.0 (hackathon demo; contact: demo@urbanlens.local)",
            Accept: "application/json",
          },
          body: "data=" + encodeURIComponent(query),
        });
        if (res.status === 429 || res.status === 504) throw new Error("HTTP " + res.status + " (retryable)");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        return json.elements ?? [];
      } catch (e) {
        console.warn("  failed:", e.message);
        lastErr = e;
        if (/retryable/.test(e.message)) await sleep(4000 * attempt);
        else break; // non-retryable → next endpoint
      }
    }
  }
  throw lastErr;
}

function facilityType(tags) {
  const a = tags.amenity;
  if (a === "hospital") return "hospital";
  if (a === "clinic" || a === "doctors" || a === "health_post") return "clinic";
  if (a === "school") return "school";
  if (a === "college" || a === "university") return "college";
  if (a === "fire_station") return "fire_station";
  if (a === "police") return "police_station";
  if (a === "townhall") return "government_office";
  if (tags.leisure === "park") return "park";
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.office === "government") return "government_office";
  if (tags.railway === "subway_entrance") return "metro_station";
  if (tags.railway === "station" && (tags.station === "subway" || tags.subway === "yes")) return "metro_station";
  return null;
}

const CAP = {
  hospital: 300, clinic: 20, school: 800, college: 3000, park: 20,
  fire_station: 8, police_station: 40, bus_stop: 1, metro_station: 1, government_office: 60,
};
const LABEL = {
  hospital: "Hospital", clinic: "Clinic", school: "School", college: "College", park: "Park",
  fire_station: "Fire Station", police_station: "Police Station", bus_stop: "Bus Stop",
  metro_station: "Metro Station", government_office: "Govt. Office",
};

async function fetchFacilities(BBOX) {
  const q = `[out:json][timeout:120];
(
  nwr["amenity"="hospital"](${BBOX});
  nwr["amenity"="clinic"](${BBOX});
  nwr["amenity"="doctors"](${BBOX});
  nwr["amenity"="school"](${BBOX});
  nwr["amenity"="college"](${BBOX});
  nwr["amenity"="university"](${BBOX});
  nwr["leisure"="park"](${BBOX});
  nwr["amenity"="fire_station"](${BBOX});
  nwr["amenity"="police"](${BBOX});
  node["highway"="bus_stop"](${BBOX});
  node["railway"="subway_entrance"](${BBOX});
  node["railway"="station"](${BBOX});
  nwr["office"="government"](${BBOX});
  nwr["amenity"="townhall"](${BBOX});
);
out center tags;`;
  const els = await overpass(q);
  const features = [];
  let seq = 1;
  const seen = new Set();
  for (const el of els) {
    const tags = el.tags ?? {};
    const type = facilityType(tags);
    if (!type) continue;
    const lon = el.lon ?? el.center?.lon;
    const lat = el.lat ?? el.center?.lat;
    if (lon == null || lat == null) continue;
    // de-dup near-identical points of the same type
    const key = `${type}:${lon.toFixed(4)}:${lat.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({
      type: "Feature",
      properties: {
        id: `OSM-${el.type[0].toUpperCase()}${el.id}`,
        name: tags.name || tags["name:en"] || LABEL[type],
        facility_type: type,
        capacity: CAP[type],
        source: "OpenStreetMap",
      },
      geometry: { type: "Point", coordinates: [Number(lon.toFixed(6)), Number(lat.toFixed(6))] },
    });
    seq++;
  }
  return { type: "FeatureCollection", features };
}

function roadType(tags) {
  const h = tags.highway;
  if (h === "motorway" || h === "motorway_link") return { t: "highway", i: 1.0 };
  if (h === "trunk" || h === "trunk_link") return { t: "highway", i: 0.92 };
  if (h === "primary" || h === "primary_link") return { t: "arterial", i: 0.82 };
  if (h === "secondary") return { t: "arterial", i: 0.7 };
  return null;
}

async function fetchRoads(BBOX) {
  const q = `[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](${BBOX});
  way["waterway"="river"](${BBOX});
);
out geom;`;
  const els = await overpass(q);
  const features = [];
  for (const el of els) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((g) => [Number(g.lon.toFixed(6)), Number(g.lat.toFixed(6))]);
    const tags = el.tags ?? {};
    if (tags.waterway === "river") {
      features.push({
        type: "Feature",
        properties: { id: `OSM-W${el.id}`, name: tags.name || "River", road_type: "river", importance: 0 },
        geometry: { type: "LineString", coordinates: coords },
      });
      continue;
    }
    const rt = roadType(tags);
    if (!rt) continue;
    features.push({
      type: "Feature",
      properties: {
        id: `OSM-W${el.id}`,
        name: tags.name || tags.ref || "Road",
        road_type: rt.t,
        importance: rt.i,
      },
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * Real land polygons.
 *
 * Cadastral GLIS records are not public, so the closest real substitute is
 * OpenStreetMap's mapped land use: closed ways tagged landuse / natural /
 * leisure. These are genuine surveyed boundaries with a genuine land-use tag —
 * blocks and estates rather than individual title plots, which is stated
 * plainly in the UI rather than dressed up as cadastral data.
 */
const LAND_USE_MAP = {
  // landuse=*
  residential: "residential",
  commercial: "commercial",
  retail: "commercial",
  industrial: "industrial",
  farmland: "agriculture",
  farmyard: "agriculture",
  orchard: "agriculture",
  meadow: "agriculture",
  allotments: "agriculture",
  forest: "green",
  grass: "green",
  village_green: "green",
  recreation_ground: "green",
  cemetery: "green",
  greenfield: "vacant",
  brownfield: "vacant",
  construction: "vacant",
  quarry: "industrial",
  landfill: "industrial",
  religious: "institutional",
  education: "institutional",
  institutional: "institutional",
  military: "institutional",
  government: "institutional",
  railway: "industrial",
  reservoir: "water",
  basin: "water",
};
const NATURAL_MAP = {
  water: "water",
  wetland: "water",
  wood: "green",
  scrub: "green",
  grassland: "green",
  heath: "green",
  sand: "vacant",
  bare_rock: "vacant",
};
const LEISURE_MAP = {
  park: "green",
  garden: "green",
  golf_course: "green",
  pitch: "green",
  sports_centre: "institutional",
  stadium: "institutional",
};

function landUseOf(tags) {
  if (tags.landuse && LAND_USE_MAP[tags.landuse]) return LAND_USE_MAP[tags.landuse];
  if (tags.natural && NATURAL_MAP[tags.natural]) return NATURAL_MAP[tags.natural];
  if (tags.leisure && LEISURE_MAP[tags.leisure]) return LEISURE_MAP[tags.leisure];
  if (tags.amenity === "school" || tags.amenity === "college" || tags.amenity === "university")
    return "institutional";
  if (tags.amenity === "hospital") return "institutional";
  return null;
}

/**
 * OSM tags that indicate public ownership. Rare but real — where present it
 * beats modelling tenure, so it is carried through as a confirmed signal.
 */
function governmentHint(tags) {
  if (tags.landuse === "military" || tags.landuse === "government") return true;
  if (tags.operator_type === "government" || tags.operator_type === "public") return true;
  if (tags.ownership === "public" || tags.ownership === "government") return true;
  const op = (tags.operator || "").toLowerCase();
  if (/municipal|corporation|government|govt|state of|railway|nagar palika|amc\b|auda/.test(op)) return true;
  if (tags.amenity === "townhall") return true;
  return false;
}

/** Shoelace area in m², good enough for filtering tiny slivers. */
function approxAreaSqm(ring) {
  const R = 6378137;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    s += ((x2 - x1) * Math.PI) / 180 * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((s * R * R) / 2);
}

async function fetchLand(BBOX) {
  const q = `[out:json][timeout:180];
(
  way["landuse"](${BBOX});
  way["natural"~"^(water|wetland|wood|scrub|grassland|heath|sand|bare_rock)$"](${BBOX});
  way["leisure"~"^(park|garden|golf_course|pitch|sports_centre|stadium)$"](${BBOX});
);
out geom tags;`;
  const els = await overpass(q);
  const features = [];
  let skippedOpen = 0;
  let skippedTiny = 0;

  for (const el of els) {
    const g = el.geometry;
    if (!g || g.length < 4) continue;
    const tags = el.tags ?? {};
    const use = landUseOf(tags);
    if (!use) continue;

    // Only closed ways describe an area. Multipolygon relations are skipped —
    // they are a small share here and need member assembly to be correct.
    const first = g[0];
    const last = g[g.length - 1];
    if (first.lat !== last.lat || first.lon !== last.lon) {
      skippedOpen++;
      continue;
    }

    const ring = g.map((p) => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))]);
    const area = approxAreaSqm(ring);
    // Below ~500 m² these are mapping artefacts, not usable land units.
    if (area < 500) {
      skippedTiny++;
      continue;
    }

    features.push({
      type: "Feature",
      properties: {
        id: `OSM-W${el.id}`,
        name: tags.name || null,
        land_use: use,
        osm_tag: tags.landuse ? `landuse=${tags.landuse}`
          : tags.natural ? `natural=${tags.natural}`
          : tags.leisure ? `leisure=${tags.leisure}`
          : `amenity=${tags.amenity}`,
        government: governmentHint(tags),
        area_sqm: Math.round(area),
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }

  console.log(`  (skipped ${skippedOpen} open ways, ${skippedTiny} slivers <500m²)`);
  return { type: "FeatureCollection", features };
}

const CITIES = ["ahmedabad", "gandhinagar"];
const requested = process.argv.slice(2);
const targets = requested.length ? requested : CITIES;

for (const cityId of targets) {
  const BBOX = bboxFor(cityId);
  console.log(`\n=== ${cityId} — bbox ${BBOX} ===`);

  const facilities = await fetchFacilities(BBOX);
  const byType = {};
  for (const f of facilities.features) {
    byType[f.properties.facility_type] = (byType[f.properties.facility_type] ?? 0) + 1;
  }
  console.log("facilities:", facilities.features.length, byType);
  writeFileSync(join(OUT, `${cityId}_facilities.json`), JSON.stringify(facilities));

  const roads = await fetchRoads(BBOX);
  console.log("roads:", roads.features.length);
  writeFileSync(join(OUT, `${cityId}_roads.json`), JSON.stringify(roads));

  const land = await fetchLand(BBOX);
  const byUse = {};
  let govt = 0;
  for (const f of land.features) {
    byUse[f.properties.land_use] = (byUse[f.properties.land_use] ?? 0) + 1;
    if (f.properties.government) govt++;
  }
  console.log("land polygons:", land.features.length, byUse, `| ${govt} tagged public`);
  writeFileSync(join(OUT, `${cityId}_land.json`), JSON.stringify(land));

  writeFileSync(
    join(OUT, `${cityId}_meta.json`),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        bbox: BBOX,
        source: "OpenStreetMap via Overpass API",
        facilities: facilities.features.length,
        roads: roads.features.length,
        land: land.features.length,
      },
      null,
      2
    )
  );
  console.log(`✓ ${cityId} → ${OUT}`);
}
