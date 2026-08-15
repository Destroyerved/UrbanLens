/**
 * Stage the self-hosted CesiumJS build into public/cesium.
 *
 * The 3D view loads Cesium with a plain <script> tag against
 * `CESIUM_BASE_URL = "/cesium"` rather than importing it, which keeps a 5 MB
 * library out of the Turbopack bundle and off the critical path for the 2D map
 * that every page depends on. That means the runtime assets have to physically
 * exist under public/.
 *
 * Runs from `postinstall`, so a fresh clone gets a working 3D view after
 * `npm install` with no extra step. The output is gitignored — it is derived
 * from node_modules and would add ~14 MB to the repo.
 *
 * `index.js` / `index.cjs` are deliberately skipped: those are the ESM/CJS entry
 * points for bundler imports, which this loading strategy does not use.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dirname, "..");
const SRC = join(WEB, "node_modules", "cesium", "Build", "Cesium");
const DEST = join(WEB, "public", "cesium");

/** Only what the browser actually fetches at runtime. */
const PARTS = ["Cesium.js", "Assets", "ThirdParty", "Widgets", "Workers"];

if (!existsSync(SRC)) {
  // Not an error: `npm install --omit=optional` or a partial install can land
  // here, and the app degrades to 2D with a clear message rather than failing.
  console.warn("! cesium build not found in node_modules — skipping (3D view will be unavailable)");
  process.exit(0);
}

// Skip the copy when the staged build already matches the installed version.
const installedVersion = JSON.parse(
  readFileSync(join(WEB, "node_modules", "cesium", "package.json"), "utf8")
).version;
const stamp = join(DEST, ".version");
if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === installedVersion) {
  console.log(`✓ cesium ${installedVersion} already staged at public/cesium`);
  process.exit(0);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
for (const part of PARTS) {
  const from = join(SRC, part);
  if (!existsSync(from)) continue;
  cpSync(from, join(DEST, part), { recursive: true });
}
writeFileSync(stamp, installedVersion);

console.log(`✓ staged cesium ${installedVersion} → public/cesium`);
