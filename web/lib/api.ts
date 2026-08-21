/**
 * Client for the Python spatial engine.
 *
 * Analysis lives in one place — the FastAPI backend. The UI used to compute
 * suitability, gaps, simulation and growth itself in lib/analysis.ts, which
 * meant two implementations of every idea and two different answers for the
 * same city. These calls replace that.
 *
 * Map layers (parcels, wards, facilities, roads, grid) come from here too, via
 * lib/dataset.ts, and are swapped when the study area changes. They used to be
 * baked into the bundle; fetching them is what lets four study areas exist
 * without shipping four cities' geometry to everyone who opens the page.
 */

const CONFIGURED_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const BASE =
  CONFIGURED_BASE ||
  (typeof window !== "undefined" ? "" : "http://127.0.0.1:8000");

export const API_BASE = BASE;

/** Active study area. The backend takes `?city=` on every route. */
let currentCity = process.env.NEXT_PUBLIC_CITY ?? "ahmedabad";

export function setApiCity(city: string) {
  currentCity = city;
}
export function getApiCity() {
  return currentCity;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function url(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const target = BASE + path;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const u = new URL(target, origin);
  u.searchParams.set("city", currentCity);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function request<T>(path: string, init?: RequestInit, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path, params), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (cause) {
    // The engine is a separate process; a refused connection is the common
    // case in development and deserves a message that says what to start.
    throw new ApiError(
      `Cannot reach the spatial engine at ${BASE}. Start it with: cd backend && uvicorn app.main:app --port 8000`,
      0,
      path,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(body || res.statusText, res.status, path);
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
  return request<T>(path, undefined, params);
}

export function apiPost<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function apiPostPdf(path: string, body: unknown): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError(
      `Cannot reach the spatial engine at ${BASE}. Start it with: cd backend && uvicorn app.main:app --port 8000`,
      0,
      path,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || res.statusText, res.status, path);
  }
  return res.blob();
}

/** Is the engine up? Used to show an actionable message rather than a blank panel. */
export async function engineAvailable(): Promise<boolean> {
  try {
    await apiGet("/api/health");
    return true;
  } catch {
    return false;
  }
}

/**
 * Ride out transient engine contention instead of failing permanently.
 *
 * A cold engine start warms 34 districts, and a request landing in that
 * window — or racing the first synchronous build of a cache — can get reset
 * even though the engine is healthy a second later. Panels that fetch once on
 * mount turn that into a permanent "failed to load", or worse: a swallowed
 * error that renders as a legitimate-looking zero. Three attempts with a
 * short backoff; the last failure still throws for the caller to handle.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 1500,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}


/** Wake a sleeping free-tier backend without blocking the already-static UI. */
export function warmEngine(): void {
  if (typeof window === "undefined") return;
  void fetch(url("/api/health", { deep: true }), {
    method: "GET",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Best-effort only: the dashboard itself is already usable from static data.
  });
}
