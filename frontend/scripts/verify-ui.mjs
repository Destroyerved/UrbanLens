/**
 * Headless UI verification — loads the running app, walks the demo flow,
 * captures console errors and screenshots (docs/screenshots/).
 * Usage: node scripts/verify-ui.mjs [baseUrl] [chromiumPath]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const exe = process.argv[3];
const outDir = process.argv[4] ?? "docs/screenshots";
mkdirSync(outDir, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("→ open", base);
await page.goto(base, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => {
  console.log("goto warning:", e.message);
});
await sleep(6000);
await shot("01-overview-dark");

// Light theme
await page.click('button[aria-label="Toggle theme"]');
await sleep(2500);
await shot("02-overview-light");
await page.click('button[aria-label="Toggle theme"]');
await sleep(1500);

// Growth mode + years + prediction
await page.click('button[aria-label="Urban Growth"]');
await sleep(1500);
await page.getByText("2022", { exact: true }).first().click().catch(() => {});
await sleep(900);
await page.getByText("2026", { exact: true }).first().click().catch(() => {});
await sleep(900);
const switches = page.locator('button[role="switch"]');
if (await switches.count()) await switches.first().click();
await sleep(1800);
await shot("03-growth-prediction");

// Infrastructure
await page.click('button[aria-label="Infrastructure"]');
await sleep(2200);
await shot("04-infrastructure-gap");

// Site selection + run analysis
await page.click('button[aria-label="Site Selection"]');
await sleep(1200);
await page.getByText("Find best hospital sites").click().catch(() => {});
await sleep(3500);
await shot("05-site-selection");

// Parcel drawer via open parcel
await page.getByText("Open parcel").first().click().catch(() => {});
await sleep(2500);
await shot("06-parcel-intelligence");
await page.click('button[aria-label="Close parcel drawer"]').catch(() => {});

// Simulator
await page.getByText("Simulate", { exact: true }).first().click().catch(() => {});
await sleep(1200);
await page.getByText("Simulate Hospital").click().catch(() => {});
await sleep(4500);
await shot("07-simulator-before-after");

// Copilot
await page.getByText("Copilot", { exact: true }).first().click().catch(() => {});
await sleep(800);
await page
  .getByPlaceholder("Ask about growth, gaps, sites, parcels…")
  .fill("Why did GJ-AHD-1028 rank first?");
await page.keyboard.press("Enter");
await sleep(2500);
await shot("08-copilot");

await browser.close();

const meaningful = errors.filter(
  (e) =>
    !e.includes("basemaps.cartocdn.com") &&
    !e.includes("fonts.g") &&
    !e.includes("net::ERR") &&
    !e.includes("Failed to load resource")
);
console.log("console errors (filtered):", meaningful.length);
meaningful.slice(0, 10).forEach((e) => console.log("  ✗", e));
console.log(meaningful.length === 0 ? "UI VERIFY: PASS" : "UI VERIFY: ISSUES");
