/**
 * Fetch real taluka (sub-district) boundaries from OpenStreetMap.
 *
 * Run: `node scripts/fetch-talukas.mjs`  → data/real/talukas.json
 *
 * This is what makes peri-urban coverage possible. Municipal wards stop at the
 * corporation limit, but the land that a metropolitan area actually expands into
 * lies beyond it, and the only real administrative units out there are talukas.
 *
 * In Gujarat's OSM data, admin_level=5 is the district and admin_level=6 the
 * taluka. Both are mapped as relations, so member ways have to be stitched into
 * rings — Overpass returns the geometry but not the assembled polygon.
 *
 * POPULATION IS DELIBERATELY NOT FETCHED HERE. No taluka in this area carries a
 * population tag in OSM, and none of their Wikidata items carry P1082 either
 * (checked for all of them). Districts do, so the metro build allocates the
 * district total downward — see build-metro.mjs. Anything else would mean
 * inventing census figures.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "real");
mkdirSync(OUT, { recursive: true });

/** Study area: both districts plus margin. south,west,north,east */
const BBOX = "22.75,72.25,23.50,72.95";

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
        console.log(`→ ${url} (attempt ${attempt})`);
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
        console.warn("  failed:", e.message);
        lastErr = e;
        if (/retryable/.test(e.message)) await sleep(5000 * attempt);
        else break;
      }
    }
  }
  throw lastErr;
}

/**
 * Stitch a relation's outer member ways into closed rings.
 *
 * Members arrive as unordered fragments that share endpoints. Repeatedly take an
 * open fragment and extend it — from either end, reversing when needed — until it
 * closes. Fragments that never close are dropped: a torn boundary would produce
 * a bogus polygon, and silently wrong geometry is worse than a missing unit.
 */
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
      rings.push(line.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]));
    }
  }
  return rings;
}

/** Shoelace area in m² — used to pick the largest ring and drop slivers. */
function approxAreaSqm(ring) {
  const R = 6378137;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    s += (((x2 - x1) * Math.PI) / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((s * R * R) / 2);
}

// `out geom` and NOT `out geom tags`: the tags modifier makes Overpass return
// bounds only, dropping the member ways the rings are assembled from. Relation
// tags come back either way.
const q = `[out:json][timeout:240];
relation["boundary"="administrative"]["admin_level"~"^(5|6)$"](${BBOX});
out geom;`;

const els = await overpass(q);
console.log(`relations: ${els.length}`);

const features = [];
let dropped = 0;
for (const el of els) {
  const tags = el.tags ?? {};
  const rings = assembleRings(el.members ?? []);
  if (!rings.length) {
    dropped++;
    continue;
  }
  // Keep the largest closed ring as the unit's outline. Inner rings (enclaves)
  // are rare at this level and are not needed for area-weighted allocation.
  rings.sort((a, b) => approxAreaSqm(b) - approxAreaSqm(a));
  const ring = rings[0];
  const area = approxAreaSqm(ring);
  if (area < 1e6) {
    dropped++;
    continue;
  }

  features.push({
    type: "Feature",
    properties: {
      id: `OSM-R${el.id}`,
      name: (tags["name:en"] || tags.name || "").replace(/\s*Taluka\s*$/i, "").trim(),
      admin_level: Number(tags.admin_level),
      kind: Number(tags.admin_level) === 5 ? "district" : "taluka",
      wikidata: tags.wikidata ?? null,
      area_sqm: Math.round(area),
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
}

features.sort((a, b) => a.properties.admin_level - b.properties.admin_level || a.properties.name.localeCompare(b.properties.name));

const districts = features.filter((f) => f.properties.kind === "district");
const talukas = features.filter((f) => f.properties.kind === "taluka");
console.log(`assembled: ${districts.length} districts, ${talukas.length} talukas (${dropped} dropped: unclosed or <1km²)`);
for (const d of districts) console.log(`   district ${d.properties.name} — ${(d.properties.area_sqm / 1e6).toFixed(0)} km²`);

writeFileSync(
  join(OUT, "talukas.json"),
  JSON.stringify({
    type: "FeatureCollection",
    features,
    meta: {
      source: "OpenStreetMap administrative boundaries via Overpass API",
      bbox: BBOX,
      districts: districts.length,
      talukas: talukas.length,
      note: "Geometry only. No taluka in this area carries a population tag in OSM or a P1082 claim in Wikidata; district totals are used instead and allocated downward.",
      fetchedAt: new Date().toISOString(),
    },
  })
);
console.log(`✓ wrote ${join(OUT, "talukas.json")}`);
