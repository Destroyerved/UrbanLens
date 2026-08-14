/**
 * Fetch REAL Ahmedabad infrastructure from OpenStreetMap via the Overpass API
 * and cache it to web/data/real/. Run once: `node scripts/fetch-osm.mjs`.
 *
 * Facilities + major roads + the Sabarmati river become authoritative "real"
 * layers; parcels, wards and population remain synthetic demo data.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "real");
mkdirSync(OUT, { recursive: true });

// Overpass bbox: south,west,north,east  (matches lib/config.ts AHMEDABAD bbox)
const BBOX = "22.94,72.46,23.13,72.69";
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

async function fetchFacilities() {
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

async function fetchRoads() {
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

const facilities = await fetchFacilities();
const byType = {};
for (const f of facilities.features) byType[f.properties.facility_type] = (byType[f.properties.facility_type] ?? 0) + 1;
console.log("facilities:", facilities.features.length, byType);
writeFileSync(join(OUT, "facilities.json"), JSON.stringify(facilities));

const roads = await fetchRoads();
console.log("roads:", roads.features.length);
writeFileSync(join(OUT, "roads.json"), JSON.stringify(roads));

writeFileSync(
  join(OUT, "meta.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), bbox: BBOX, source: "OpenStreetMap via Overpass API", facilities: facilities.features.length, roads: roads.features.length }, null, 2)
);
console.log("✓ wrote real data to", OUT);
