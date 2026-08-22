/**
 * Start the whole stack with one command.
 *
 *   npm run dev            # engine on :8000, app on :3000
 *
 * UrbanLens is two processes — the Python spatial engine and the Next app — and
 * the app is useless without the engine, because every figure it shows is
 * computed there. Starting them separately is an easy thing to get half-right:
 * the UI comes up, the panels sit on "Computing city intelligence…", and it
 * looks like a bug in the app rather than a missing backend.
 *
 * No dependencies — plain child_process, so this works straight after clone.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = join(ROOT, "backend");
const WEB = join(ROOT, "web");

const COLOURS = { engine: "\x1b[36m", web: "\x1b[35m", dim: "\x1b[2m", off: "\x1b[0m" };

if (!existsSync(join(WEB, "node_modules"))) {
  console.error(
    `${COLOURS.web}web${COLOURS.off}  node_modules missing — run:  npm install --prefix web`,
  );
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function run(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `${COLOURS[name] ?? ""}${name.padEnd(6)}${COLOURS.off}`;

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
    // One half of the stack dying leaves the other in a state that only looks
    // like it works, so take both down and say which one went.
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

console.log(`${COLOURS.dim}UrbanLens — engine :8000  ·  app :3000${COLOURS.off}`);
console.log(`${COLOURS.dim}Open http://localhost:3000 and click the globe to enter.${COLOURS.off}\n`);

import { execSync } from "node:child_process";

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const candidates = [
    join(BACKEND, ".venv", "bin", "python"),
    join(BACKEND, ".venv", "Scripts", "python.exe"),
    join(ROOT, ".venv", "bin", "python"),
    join(ROOT, ".venv", "Scripts", "python.exe"),
    "python3",
    "python",
  ];
  for (const cmd of candidates) {
    if (existsSync(cmd)) return cmd;
    try {
      execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return "python3";
}

const python = resolvePython();
run("engine", python, ["-m", "uvicorn", "app.main:app", "--port", "8000"], BACKEND);
run("web", "npm", ["run", "dev"], WEB);
