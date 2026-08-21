/**
 * Serve the engine from this machine, publicly, for a demo.
 *
 *   NGROK_DOMAIN=your-name.ngrok-free.app npm run demo:host
 *
 * The frontend stays on Vercel; only the Python engine runs here. That split
 * works because the browser calls the engine directly (NEXT_PUBLIC_API_URL),
 * and because the heavy per-district payloads are served as static assets by
 * Vercel — web/lib/dataset.ts tries /data/bootstrap/<city>.json.gz first and
 * only falls back to /api/bootstrap. So a home uplink carries the small
 * analytic calls, not 8 MB of geometry.
 *
 * Why bother when Cloud Run exists: this machine has the SQLite parcel cache
 * that no deployment ships, so it answers faster, and it has enough RAM for
 * Kutch (measured 2,956 MB building 131,125 parcels) which no free tier does.
 *
 * The tunnel must terminate TLS. Vercel is HTTPS, so a plain http:// backend
 * is blocked as mixed content before the request is even sent.
 *
 * No dependencies — plain child_process, matching scripts/dev.mjs.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = join(ROOT, "backend");
const PORT = process.env.ENGINE_PORT ?? "8000";
const DOMAIN = process.env.NGROK_DOMAIN;

const C = { engine: "\x1b[36m", tunnel: "\x1b[33m", warn: "\x1b[31m", dim: "\x1b[2m", off: "\x1b[0m" };

function have(cmd) {
  try {
    execSync(`${cmd} version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!have("ngrok")) {
  console.error(`${C.warn}ngrok not found${C.off} — install it, then claim your free static domain:
  https://ngrok.com/download
  https://dashboard.ngrok.com/domains

A static domain matters here: NEXT_PUBLIC_API_URL is inlined into the Vercel
build, so a URL that changes on every restart means a redeploy every restart.`);
  process.exit(1);
}

if (!DOMAIN) {
  console.error(`${C.warn}NGROK_DOMAIN is not set${C.off} — pass your free static domain:
  NGROK_DOMAIN=your-name.ngrok-free.app npm run demo:host`);
  process.exit(1);
}

// The local cache is the whole point of hosting here rather than in the cloud.
if (!existsSync(join(BACKEND, "urbanlens.db"))) {
  console.log(`${C.dim}note: backend/urbanlens.db absent — the engine will parse GeoJSON
      layers instead, which still works but is slower on first request.${C.off}`);
}

const children = [];
let shuttingDown = false;

function run(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `${C[name] ?? ""}${name.padEnd(6)}${C.off}`;

  const relay = (stream) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
    });
  };
  relay(child.stdout);
  relay(child.stderr);

  child.on("exit", (code) => {
    if (shuttingDown) return;
    // A live tunnel over a dead engine serves 502s that look like CORS errors
    // in the browser console, which is a genuinely misleading place to land.
    console.log(`${tag} exited (${code}) — stopping the other process too`);
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  for (const cmd of ["python3", "python"]) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return "python3";
}

console.log(`${C.dim}UrbanLens engine — local :${PORT}  ·  public https://${DOMAIN}${C.off}`);
console.log(`${C.dim}Set NEXT_PUBLIC_API_URL=https://${DOMAIN} in Vercel and redeploy (once).${C.off}`);
console.log(`${C.dim}Keep this laptop awake and online for the whole demo.${C.off}\n`);

// Loopback only: ngrok connects locally, so there is no reason to listen on
// every interface and expose the engine to the venue's network as well.
run("engine", resolvePython(), [
  "-m", "uvicorn", "app.main:app",
  "--host", "127.0.0.1", "--port", PORT,
], BACKEND);

run("tunnel", "ngrok", ["http", `--url=${DOMAIN}`, PORT]);
