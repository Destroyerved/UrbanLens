/**
 * Walks the PRD §74 demo scenario end to end against the running app.
 *
 *   npm run demo            # against http://localhost:3000
 *   URBANLENS_API=… URBANLENS_CITY=ahmedabad-metro npm run demo
 *
 * Each step feeds the next — the site chosen in step 8 is the site simulated in
 * step 10 and explained in step 12 — so this fails if the story does not hold
 * together, not merely if a route 500s.
 *
 * This exercises the engine and the numbers the demo quotes. It does not click
 * the UI; the interaction layer still needs a human at a real screen.
 */
const API = (process.env.URBANLENS_API ?? "http://localhost:3000").replace(/\/$/, "");
const CITY = process.env.URBANLENS_CITY ?? "ahmedabad";
/** The intervention the story is built around. Hospital is the PRD's example. */
const PROJECT = process.env.URBANLENS_PROJECT ?? "hospital";

let failures = 0;
let stepNo = 0;

const fmt = (n) => Number(n).toLocaleString("en-IN");

function step(title) {
  stepNo++;
  console.log(`\n\x1b[1m${String(stepNo).padStart(2, "0")}  ${title}\x1b[0m`);
}
function ok(msg) {
  console.log(`    \x1b[32m✓\x1b[0m ${msg}`);
}
function bad(msg) {
  failures++;
  console.log(`    \x1b[31m✗ ${msg}\x1b[0m`);
}
function check(cond, good, failMsg) {
  cond ? ok(good) : bad(failMsg ?? good);
  return cond;
}

async function get(path) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}city=${encodeURIComponent(CITY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}
async function post(path, body) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}city=${encodeURIComponent(CITY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

console.log(`\nUrbanLens — PRD §74 demo walkthrough`);
console.log(`${API}  ·  city=${CITY}  ·  project=${PROJECT}`);

// ── 1 ───────────────────────────────────────────────────────────────────────
step("Open the city");
const overview = await get("/api/overview");
check(overview.city_name?.length > 0, `${overview.city_name} — ${overview.ward_count} wards, ${fmt(overview.area_km2)} km²`);
check(overview.population > 0, `Population ${fmt(overview.population)}`);
check(overview.total_parcels > 0, `${fmt(overview.total_parcels)} parcels, ${fmt(overview.government_parcels)} government`);
check(
  overview.sources?.parcels?.source === "osm",
  `Parcels sourced from ${overview.sources.parcels.source} — provenance is stated, not assumed`,
  "parcels layer is not reporting a real source"
);

// ── 2 ───────────────────────────────────────────────────────────────────────
step("Urban growth, 2018 → 2026");
const growth = await get("/api/growth");
const b = growth.built_up_km2;
check(b[2018] < b[2022] && b[2022] < b[2026], `Built-up ${b[2018]} → ${b[2022]} → ${b[2026]} km² (monotonic)`, `built-up is not increasing: ${JSON.stringify(b)}`);
check(growth.growth_pct_2018_2026 > 0, `Growth +${growth.growth_pct_2018_2026}% over the period`);
check(growth.corridors?.length > 0, `${growth.corridors.length} expansion corridors detected`);
const topCorridor = [...growth.corridors].sort((x, y) => y.predicted_growth_pct - x.predicted_growth_pct)[0];
ok(`Strongest: ${topCorridor.name} — ${topCorridor.predicted_growth_pct}% predicted, ${fmt(topCorridor.population)} residents`);

// ── 3 ───────────────────────────────────────────────────────────────────────
step("2030 growth prediction");
const pred = await get("/api/growth/prediction");
const cells = pred.features ?? [];
const high = cells.filter((c) => ["high", "very_high"].includes(c.properties.risk_category));
check(cells.length > 0, `${fmt(cells.length)} prediction cells`);
check(high.length > 0 && high.length < cells.length, `${fmt(high.length)} cells at high or very-high growth probability`, "prediction does not discriminate — all or no cells are high");

// ── 4 ───────────────────────────────────────────────────────────────────────
step("Infrastructure gap analysis");
const gaps = await get("/api/infrastructure/gaps");
const worst = gaps.wards[0];
check(gaps.wards.length > 0, `${gaps.wards.length} units ranked by population × unmet need`);
ok(`Most underserved: ${worst.name} — overall ${worst.overall}/100, healthcare ${worst.scores.healthcare}/100, ${fmt(worst.population)} residents`);
const thin = (gaps.coverage ?? []).filter((c) => c.confidence === "low");
check(
  Array.isArray(gaps.coverage),
  thin.length
    ? `Source-coverage stated: ${thin.map((c) => c.service).join(", ")} flagged as thin data`
    : "Source-coverage stated for every service",
  "gap scores are being served without their data-confidence"
);

// ── 5 ───────────────────────────────────────────────────────────────────────
step(`Population + who is beyond reach of a ${PROJECT.replace("_", " ")}`);
const popGrid = await get("/api/population");
check(popGrid.features?.length > 0, `${fmt(popGrid.features.length)} population cells at ${popGrid.properties.cell_size_m} m`);
check(
  Math.abs(popGrid.properties.total_population - overview.population) < 5,
  `Raster conserves population: ${fmt(popGrid.properties.total_population)} vs ${fmt(overview.population)} city total`,
  `raster lost people: ${fmt(popGrid.properties.total_population)} vs ${fmt(overview.population)}`
);
const underserved = gaps.wards.filter((w) => w.scores.healthcare < 50);
ok(`${underserved.length} units below 50/100 on healthcare, ${fmt(underserved.reduce((s, w) => s + w.population, 0))} residents`);

// ── 6 ───────────────────────────────────────────────────────────────────────
step(`Ask: "Where should a new ${PROJECT.replace("_", " ")} be built?"`);
const ask = await post("/api/copilot/query", { query: `Where should we build a new ${PROJECT.replace("_", " ")}?` });
check(ask.tool === "site_search", `Routed to the ${ask.tool} tool`, `expected site_search, got ${ask.tool}`);
check((ask.items ?? []).length > 0, `${ask.items.length} candidate sites returned`);
ok(`"${ask.answer.slice(0, 130)}…"`);

// ── 7 ───────────────────────────────────────────────────────────────────────
step("Suitability engine applies the constraints");
const search = await post("/api/suitability/search", {
  project_type: PROJECT,
  government_land: true,
  low_flood_risk: true,
  minimum_area_hectares: 2,
  limit: 3,
});
check(search.results.length > 0, `${fmt(search.eligible)} of ${fmt(search.evaluated)} parcels passed government + flood + size constraints`);
const top = search.results[0];
const factors = Object.keys(top.breakdown);
check(factors.length === 6, `Six factors scored: ${factors.join(", ")}`, `expected 6 factors, got ${factors.length}`);

// ── 8 ───────────────────────────────────────────────────────────────────────
step("Top-ranked site");
ok(`#1 ${top.parcel_id} — ${top.final}/100`);
ok(`   ${top.metrics.areaAcres} acres · ${top.metrics.ownership} · flood risk ${top.metrics.floodRisk} · ${top.metrics.roadKm.toFixed(2)} km to road`);
ok(`   serves ~${fmt(top.pop)} residents within the service radius`);
check(top.metrics.ownership === "government", "Site is government-owned — no acquisition needed", "top site is not government land despite the constraint");
check(
  search.results.every((r, i) => i === 0 || r.final <= search.results[i - 1].final),
  "Results are correctly ranked by score",
  "ranking is not monotonic"
);

// ── 9 ───────────────────────────────────────────────────────────────────────
step("Why it ranked first");
check(top.explanation.pros.length > 0, `${top.explanation.pros.length} supporting reasons, ${top.explanation.cons.length} stated concerns`);
for (const p of top.explanation.pros.slice(0, 4)) ok(`   ✓ ${p}`);
for (const c of top.explanation.cons.slice(0, 2)) ok(`   ⚠ ${c}`);
check(
  top.explanation.cons.length > 0 || top.final >= 90,
  "Concerns are surfaced alongside strengths",
  "no concerns listed — recommendation looks uncritical"
);

// ── 10 ──────────────────────────────────────────────────────────────────────
step(`Simulate a ${PROJECT.replace("_", " ")} on that exact site`);
const sim = await post("/api/scenarios/simulate", {
  project_type: PROJECT,
  lng: top.centroid[0],
  lat: top.centroid[1],
});
check(sim.applicable !== false, `Simulation ran over a ${sim.analysis_radius_km} km analysis window`);
check(sim.window_population > 0, `${fmt(sim.window_population)} residents in the window`);

// ── 11 ──────────────────────────────────────────────────────────────────────
step("Before vs after");
ok(`Coverage    ${sim.coverage_before_pct}%  →  ${sim.coverage_after_pct}%`);
ok(`Avg distance ${sim.avg_distance_before_km} km  →  ${sim.avg_distance_after_km} km`);
ok(`Residents newly within reach: ${fmt(sim.residents_newly_covered)}`);
check(sim.coverage_after_pct >= sim.coverage_before_pct, "Coverage does not regress", "coverage fell after adding a facility");
check(sim.avg_distance_after_km <= sim.avg_distance_before_km, "Average distance does not increase", "average distance rose after adding a facility");
check(
  sim.residents_newly_covered > 0,
  "The intervention measurably helps someone",
  `no residents newly covered — this site is already saturated, pick a genuinely underserved location for the demo`
);

// ── 12 ──────────────────────────────────────────────────────────────────────
step('Ask: "Why is this the best location?"');
const why = await post("/api/copilot/query", { query: `Why is parcel ${top.parcel_id} a good site for a ${PROJECT.replace("_", " ")}?` });
check(/explain/.test(why.tool), `Routed to the ${why.tool} tool`, `expected an explain tool, got ${why.tool}`);
check(why.answer.includes(top.parcel_id), `Answer names the parcel from step 8 (${top.parcel_id})`, "the copilot answered about a different parcel than the one simulated");
const nums = why.answer.match(/\d[\d,.]*/g) ?? [];
check(nums.length > 0, `Answer is grounded in ${nums.length} figures from the engine, not prose`);
ok(`"${why.answer.slice(0, 160)}…"`);

// ── verdict ─────────────────────────────────────────────────────────────────
console.log(
  failures === 0
    ? `\n\x1b[32m\x1b[1mAll ${stepNo} steps passed.\x1b[0m The story holds together end to end.\n`
    : `\n\x1b[31m\x1b[1m${failures} check(s) failed across ${stepNo} steps.\x1b[0m\n`
);
process.exit(failures === 0 ? 0 : 1);
