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

/**
 * Where the engine lives, from the browser's point of view.
 *
 * Empty means same-origin: `/api/...` and `/static/...` are proxied to the
 * engine by the rewrites in next.config.mjs. That is the only base that works
 * everywhere, and the default for that reason.
 *
 * It used to default to `http://localhost:8000`, which made every request
 * cross-origin. That worked in exactly one situation — the browser running on
 * the same machine as the engine, with the app served from port 3000, because
 * those two origins are the engine's entire CORS allow-list. A production
 * build served on any other port was blocked outright, and opening the app
 * from a phone or a second laptop sent every request to *that* device's port
 * 8000. It also paid a CORS preflight round-trip per request, and resolved
 * `localhost` to ::1 first on Windows before falling back to IPv4.
 *
 * Set NEXT_PUBLIC_API_URL to an absolute URL when the engine really is on a
 * different host and you have configured CORS for it.
 */
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Absolute fallback for any code that runs before a document exists. */
const SERVER_FALLBACK = "http://127.0.0.1:8000";

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

function origin(): string {
  if (BASE) return BASE;
  // Same-origin in the browser; anything running without a document (a
  // prerender, a test) has no origin to be relative to and needs the engine's.
  return typeof window === "undefined" ? SERVER_FALLBACK : window.location.origin;
}

function url(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const u = new URL(origin() + path);
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
      `Cannot reach the spatial engine at ${origin()}. Start it with: cd backend && uvicorn app.main:app --port 8000`,
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
      `Cannot reach the spatial engine at ${origin()}. Start it with: cd backend && uvicorn app.main:app --port 8000`,
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
