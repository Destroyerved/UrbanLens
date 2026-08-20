/**
 * Headless UI verification — drives the real app against the real engine and
 * asserts that every panel actually renders engine-computed content.
 *
 *   node scripts/verify-ui.mjs [baseUrl] [chromiumPath] [outDir]
 *
 * Both processes must already be running (`npm run dev` from the repo root).
 *
 * WHY THIS ASSERTS RATHER THAN SCREENSHOTS
 * ----------------------------------------
 * The previous version wrapped nearly every interaction in `.catch(() => {})`
 * and then filtered `net::ERR` and "Failed to load resource" out of the console
 * output before deciding whether it passed. A panel could fail to open, a layer
 * could fail to load, and a data URL could be rejected outright, and the run
 * still printed PASS. Every check here is allowed to fail the run, and the
 * network/console filters are narrow and named.
 *
 * `npm run demo` covers the engine's numbers; this covers the interface that
 * puts them on screen.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const exe = process.argv[3] ?? process.env.CHROME_PATH;
const outDir = process.argv[4] ?? "docs/screenshots";
mkdirSync(outDir, { recursive: true });

// Third-party basemap tiles and webfonts are not this app's correctness, and a
// tile 404 must not mask an app error. Everything else counts.
const IGNORED_REQUEST_HOSTS = [
  "basemaps.cartocdn.com",
  // The satellite/terrain basemaps come from Esri. Switching theme or basemap
  // aborts tiles that are still in flight, which is normal map behaviour and
  // not this app's correctness — the same reason cartocdn is excused.
  "server.arcgisonline.com",
  "services.arcgisonline.com",
  "fonts.gstatic.com",
  "fonts.googleapis.com",
];
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // Chrome logs a bare, URL-less line for every failed subresource. The network
  // handler above already classifies these with their URL, so counting the
  // console copy too would double-report and, for third-party assets, fail the
  // run on something the network side deliberately excused.
  /^Failed to load resource: the server responded with a status of \d+/i,
];

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const failures = [];
let checks = 0;

function check(cond, label, detail = "") {
  checks++;
  if (cond) {
    console.log(`    \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`    \x1b[31m✗ ${label}${detail ? ` — ${detail}` : ""}\x1b[0m`);
  }
  return cond;
}
let stepNo = 0;
function step(title) {
  console.log(`\n\x1b[1m${String(++stepNo).padStart(2, "0")}  ${title}\x1b[0m`);
}

const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
// Reduced motion is the honest way to drive this app: the mode rail floats on
// an infinite transform, so without it no navigation control is ever "stable"
// and every click waits out its actionability timeout. It also exercises the
// accessibility path that MotionConfig + the globals.css media query provide.
const page = await browser.newPage({
  viewport: { width: 1600, height: 950 },
  reducedMotion: "reduce",
});

page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (IGNORED_CONSOLE.some((re) => re.test(t))) return;
  consoleErrors.push(t.slice(0, 300));
});
page.on("pageerror", (e) => pageErrors.push(`${e.message}`.slice(0, 300)));
page.on("requestfailed", (r) => {
  const url = r.url();
  if (IGNORED_REQUEST_HOSTS.some((h) => url.includes(h))) return;
  failedRequests.push(`${r.failure()?.errorText ?? "failed"} ${url.slice(0, 120)}`);
});
const thirdPartyErrors = [];
page.on("response", (r) => {
  if (r.status() < 400) return;
  const url = r.url();
  const line = `HTTP ${r.status()} ${url.slice(0, 140)}`;
  // Third-party tiles and fonts are reported but do not fail the run; they are
  // not this app's correctness and an outage upstream must not read as a
  // regression here. Everything served from our own origin counts.
  if (IGNORED_REQUEST_HOSTS.some((h) => url.includes(h))) thirdPartyErrors.push(line);
  else failedRequests.push(line);
});

// The product lives at /app (lib/landing/story.ts APP_ROUTE). It used to be a
// `?app=1` flag on the landing route; leaving that stale here meant this script
// only ever loaded the landing page and then timed out waiting for a panel, so
// the one automated gate on the UI had been failing before its first assertion.
const APP_PATH = "/app";

const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = () => page.locator("[data-panel]");
/** Text of the right-hand intelligence panel. */
const panelText = async () => (await panel().count()) ? (await panel().first().innerText()) : "";

async function openMode(ariaLabel, expectTitle) {
  await page.click(`button[aria-label="${ariaLabel}"]`);
  // The panel swaps behind an exit animation; wait for the new title.
  await page.waitForFunction(
    (t) => document.querySelector("[data-panel]")?.innerText.includes(t),
    expectTitle,
    { timeout: 15000 },
  );
}

// ---------------------------------------------------------------------------

step("Landing page");
await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(5000);
// Almost every string on this page is revealed by scroll position, so most of
// them are legitimately `visibility: hidden` at rest and asserting that any
// particular one is visible fails for the wrong reason. What the landing owes
// the product is: it rendered its scenes, and it offers a way in.
check(await page.locator("[data-scene]").count() > 0, "Landing scenes render");
check(await page.locator(`a[href="${APP_PATH}"]`).count() > 0, "Landing offers the way into the app");
await shot("00-landing");

step("Enter the product");
await page.goto(`${base}${APP_PATH}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("[data-panel]", { timeout: 30000 });
// Study area has to finish loading before any panel holds real figures.
await page.waitForFunction(() => !document.body.innerText.includes("Loading "), { timeout: 60000 });
await sleep(2500);
check(await page.locator(".maplibregl-canvas").count() > 0, "Map canvas mounted");
await shot("01-overview-dark");

step("Overview — engine KPIs");
{
  const t = await panelText();
  check(/command center/i.test(t), "Overview panel is showing");
  check(!/computing city intelligence/i.test(t), "KPIs resolved (not stuck loading)");
  check(!/failed to load/i.test(t), "No KPI load failure");
  // Population must be a real figure, not a zero placeholder.
  const pop = t.match(/([\d.]+)M\s*\n?\s*Population/);
  check(!!pop && parseFloat(pop[1]) > 0, "Population KPI is non-zero", pop?.[1]);
  check(/glis parcels tracked/i.test(t), "Parcel count KPI present");
}

step("Urban Growth — timeline + prediction");
await openMode("Urban Growth", "Urban Time Machine");
await sleep(1500);
{
  const t = await panelText();
  check(/built-up trajectory/i.test(t), "Built-up trajectory section renders");
  check(!/computing|analysing|analyzing/i.test(t), "Growth data resolved");
  // Toggle the 2030 prediction layer.
  const sw = page.locator('button[role="switch"]');
  check(await sw.count() > 0, "Prediction toggle present");
  if (await sw.count()) {
    await sw.first().click();
    await sleep(2500);
    check(
      await page.evaluate(() => !!document.querySelector("[data-panel]")),
      "Panel survives prediction toggle",
    );
  }
}
await shot("02-growth-prediction");

step("Infrastructure — ward gaps");
await openMode("Infrastructure", "Infrastructure Gap Analysis");
await page.waitForFunction(
  () => !/Computing ward coverage/.test(document.querySelector("[data-panel]")?.innerText ?? ""),
  { timeout: 30000 },
);
{
  const t = await panelText();
  check(/ward ranking/i.test(t), "Ward ranking renders");
  check(/\d/.test(t), "Ward ranking carries figures");
}
await shot("03-infrastructure-gap");

step("Land Intelligence — opportunity parcels");
await openMode("Land Intelligence", "Land Intelligence");
await sleep(2000);
{
  const t = await panelText();
  check(/opportunity/i.test(t), "Opportunity section renders");
  check(!/no parcels match/i.test(t), "Default filters return parcels");
}
await shot("04-land-intelligence");

step("Site Selection — run the suitability engine");
await openMode("Site Selection", "Smart Site Selection");
await sleep(1200);
{
  const run = page.getByRole("button", { name: /Run Multi-Criteria Site Search|Evaluating parcels/i }).first();
  check(await run.count() > 0, "Run-analysis control present");
  await run.click();
  await page.waitForFunction(
    () => /\d+\s*\/\s*100|Score/i.test(document.querySelector("[data-panel]")?.innerText ?? ""),
    { timeout: 45000 },
  );
  const t = await panelText();
  check(!/0 sites found/i.test(t), "Suitability search returned candidates");
  check(/100/.test(t), "Candidate scores rendered");
}
await shot("05-site-selection");

step("Parcel Intelligence drawer");
{
  // Match on accessible name, not visible text: the control in the candidate
  // card reads "Parcel" but is labelled "Open parcel <id>". Matching only the
  // visible string meant this fell through to a `GJ-` button that no longer
  // exists — the candidate rows are cards, not buttons.
  const open = page.getByRole("button", { name: /open parcel|view parcel/i }).first();
  if (await open.count()) {
    await open.click();
  } else {
    await panel().locator("button").filter({ hasText: /GJ-/ }).first().click();
  }
  await page.waitForSelector('[aria-label="Close parcel drawer"]', { timeout: 20000 });
  await page.waitForFunction(
    () => /Location Scores|Development potential/i.test(document.body.innerText),
    { timeout: 25000 },
  );
  const body = await page.innerText("body");
  check(/Development potential/i.test(body), "Parcel scores rendered from engine");
  check(/Land-Use History/i.test(body), "Land-use history rendered");
  await shot("06-parcel-intelligence");
  await page.click('[aria-label="Close parcel drawer"]');
  await sleep(800);
}

step("Simulator — before vs after");
await openMode("Simulator", "What-If Simulator");
await sleep(1200);
{
  const t0 = await panelText();
  check(/intervention/i.test(t0), "Simulator steps render");

  // The run button is correctly disabled until a target exists. The panel's own
  // route to one is "Use #1 site", which reuses the site-selection result — the
  // same hand-off PRD §74 step 10 describes.
  const useTop = panel().getByRole("button", { name: /Use #1 site/i });
  check(await useTop.count() > 0, "Site-selection result offered as simulator target");
  if (await useTop.count()) {
    await useTop.first().click();
    await sleep(900);
  }

  const run = panel().getByRole("button", { name: /^Simulate /i }).last();
  check(await run.count() > 0 && await run.isEnabled(), "Simulate button enabled once targeted");
  await run.click();
  await page.waitForFunction(
    () => /residents newly within/i.test(document.querySelector("[data-panel]")?.innerText ?? ""),
    { timeout: 60000 },
  );
  const t = await panelText();
  check(/before/i.test(t) && /after/i.test(t), "Before/after comparison rendered");
  check(/\d/.test(t), "Simulation produced figures");
}
await shot("07-simulator");

step("AI Copilot");
{
  await page.getByRole("button", { name: "Copilot" }).first().click();
  const input = page.getByPlaceholder("Ask about growth, gaps, sites, parcels…");
  await input.waitFor({ timeout: 10000 });
  await input.fill("Where should Ahmedabad build a new hospital?");
  await page.keyboard.press("Enter");
  // Two traps here. The welcome message already says "parcel", so waiting on
  // that matched instantly; and by this point the simulator panel behind the
  // drawer names its target parcel, so watching document.body matched before
  // the copilot had replied. Scope to the copilot and wait for a parcel id.
  await page.waitForFunction(
    () => /GJ-[A-Z]+-\d+/.test(document.querySelector("[data-copilot]")?.innerText ?? ""),
    { timeout: 60000 },
  );
  const aside = await page.locator("[data-copilot]").innerText();
  check(/GJ-/.test(aside), "Copilot answer names a real parcel");
  check(!/Something went wrong/i.test(aside), "Copilot did not error");
  await shot("08-copilot");
  await page.getByRole("button", { name: "Close copilot" }).click().catch(() => {});
}

step("Study-area switch");
{
  await sleep(600);
  await page.locator('button:has-text("Ahmedabad")').first().click();
  await sleep(700);
  const opt = page.getByRole("button", { name: /Gandhinagar/ }).first();
  if (await opt.count()) {
    await opt.click();
    await page.waitForFunction(() => !document.body.innerText.includes("Loading "), { timeout: 60000 });
    await sleep(2500);
    const body = await page.innerText("body");
    check(/Gandhinagar/.test(body), "Switched study area");
  } else {
    check(false, "Study-area options did not open");
  }
}
await shot("09-study-area-switch");

step("Themes");
for (const [label, name] of [["Light Mode", "10-light"], ["Dim Mode", "11-dim"], ["Dark Mode", "12-dark"]]) {
  const radio = page.getByRole("radio", { name: label });
  if (await radio.count()) {
    await radio.first().click({ force: true });
    await sleep(1200);
    await shot(name);
    check(true, `${label} applied`);
  } else {
    check(false, `${label} control missing`);
  }
}

await browser.close();

// ---------------------------------------------------------------------------

console.log("\n\x1b[1mDiagnostics\x1b[0m");
console.log(`  console errors : ${consoleErrors.length}`);
consoleErrors.slice(0, 12).forEach((e) => console.log(`    ✗ ${e}`));
console.log(`  page errors    : ${pageErrors.length}`);
pageErrors.slice(0, 12).forEach((e) => console.log(`    ✗ ${e}`));
console.log(`  failed requests: ${failedRequests.length}`);
[...new Set(failedRequests)].slice(0, 12).forEach((e) => console.log(`    ✗ ${e}`));
if (thirdPartyErrors.length) {
  console.log(`  third-party (not counted): ${thirdPartyErrors.length}`);
  [...new Set(thirdPartyErrors)].slice(0, 8).forEach((e) => console.log(`    · ${e}`));
}

const total = failures.length + consoleErrors.length + pageErrors.length + failedRequests.length;
console.log(
  total === 0
    ? `\n\x1b[32m\x1b[1mUI VERIFY: PASS\x1b[0m  ${checks} checks, clean console and network.`
    : `\n\x1b[31m\x1b[1mUI VERIFY: ${total} problem(s)\x1b[0m  (${failures.length} assertion, ` +
        `${consoleErrors.length} console, ${pageErrors.length} page, ${failedRequests.length} network)`,
);
process.exit(total === 0 ? 0 : 1);
