/**
 * Keep only the features that actually lie inside the state of Gujarat.
 *
 * The statewide bbox query pulls in districts/talukas from neighbouring
 * Rajasthan, Madhya Pradesh, Maharashtra and Sindh (Pakistan). Instead of
 * guessing names, we fetch the Gujarat admin_level=4 boundary and keep every
 * feature whose centroid is inside it. Data-driven and honest.
 *
 * Run: `node scripts/filter-gujarat.mjs [in.json] [out.json]`
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_IN = join(__dirname, "..", "data", "engine", "gujarat_boundaries.json");
const DEFAULT_OUT = join(__dirname, "..", "data", "engine", "gujarat_boundaries.json");

const INPUT = process.argv[2] ?? DEFAULT_IN;
const OUTPUT = process.argv[3] ?? DEFAULT_OUT;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function overpass(query) {
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "UrbanLens/1.0 (hackathon demo; contact: demo@urbanlens.local)",
          },
          body: "data=" + encodeURIComponent(query),
        });
        if (res.status === 429 || res.status === 504) throw new Error("HTTP " + res.status + " (retryable)");
        if (!res.ok) throw new Error("HTTP " + res.status);
        return (await res.json()).elements ?? [];
      } catch (e) {
        if (/retryable/.test(e.message)) await new Promise((r) => setTimeout(r, 5000 * attempt));
        else break;
      }
    }
  }
  throw new Error("all Overpass endpoints failed");
}

/** Stitch a relation's outer member ways into closed rings. */
function assembleRings(members) {
  const open = members
    .filter((m) => m.type === "way" && m.geometry && m.geometry.length >= 2)
    .filter((m) => m.role === "outer" || m.role === "" || m.role == null)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));

  const rings = [];
  while (open.length) {
    let line = open.pop();
    let extended = true;
    while (extended && line[0].join() !== line[line.length - 1].join()) {
      extended = false;
      for (let i = 0; i < open.length; i++) {
        const cand = open[i];
        const head = line[0].join();
        const tail = line[line.length - 1].join();
        const cHead = cand[0].join();
        const cTail = cand[cand.length - 1].join();

        if (tail === cHead) line = line.concat(cand.slice(1));
        else if (tail === cTail) line = line.concat([...cand].reverse().slice(1));
        else if (head === cTail) line = cand.slice(0, -1).concat(line);
        else if (head === cHead) line = [...cand].reverse().slice(0, -1).concat(line);
        else continue;

        open.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (line[0].join() === line[line.length - 1].join() && line.length >= 4) {
      rings.push(line);
    }
  }
  return rings;
}

if (!existsSync(INPUT)) {
  console.error(`! ${INPUT} missing`);
  process.exit(1);
}

console.log("Fetching Gujarat state boundary (admin_level=4) ...");
const q = `[out:json][timeout:120];
relation["boundary"="administrative"]["admin_level"="4"]["name"="Gujarat"];
out geom;`;
const els = await overpass(q);
const state = els.find((el) => el.type === "relation");
if (!state) {
  console.error("! Gujarat state relation not found");
  process.exit(1);
}
const rings = assembleRings(state.members ?? []);
if (!rings.length) {
  console.error("! could not assemble Gujarat boundary");
  process.exit(1);
}
rings.sort((a, b) => {
  const area = (r) => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
    }
    return Math.abs(s) / 2;
  };
  return area(b) - area(a);
});
const outer = rings[0];

/** Even-odd point-in-polygon (lon/lat). */
function inside(lng, lat, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      hit = !hit;
    }
  }
  return hit;
}

function centroid(coords) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const ring of coords) {
    for (const [lng, lat] of ring) {
      x += lng;
      y += lat;
      n++;
    }
  }
  return [x / n, y / n];
}

const doc = JSON.parse(readFileSync(INPUT, "utf8"));
const kept = [];
let dropped = 0;
for (const f of doc.features) {
  const c = centroid(f.geometry.coordinates);
  if (inside(c[0], c[1], outer)) kept.push(f);
  else dropped++;
}

const districts = kept.filter((f) => f.properties.kind === "district");
const talukas = kept.filter((f) => f.properties.kind === "taluka");
console.log(`kept ${kept.length} (dropped ${dropped} outside Gujarat): ${districts.length} districts, ${talukas.length} talukas`);
for (const d of districts) console.log(`   ${d.properties.name}`);

writeFileSync(
  OUTPUT,
  JSON.stringify({
    ...doc,
    features: kept,
    meta: {
      ...doc.meta,
      source: "OpenStreetMap administrative boundaries via Overpass API, filtered to the Gujarat state polygon",
      districts: districts.length,
      talukas: talukas.length,
      filtered: true,
      filteredAt: new Date().toISOString(),
    },
  })
);
console.log(`✓ wrote ${OUTPUT}`);