/**
 * Client for the Python spatial engine.
 *
 * Analysis lives in one place — the FastAPI backend. The UI used to compute
 * suitability, gaps, simulation and growth itself in lib/analysis.ts, which
 * meant two implementations of every idea and two different answers for the
 * same city. These calls replace that.
 *
 * Static layers (parcels, wards, facilities, roads, grid) are still read from
 * data/, synced from this same backend at build time — they do not change at
 * runtime, and keeping them synchronous avoids making every component async.
 */

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

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
  const u = new URL(BASE + path);
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

/** Is the engine up? Used to show an actionable message rather than a blank panel. */
export async function engineAvailable(): Promise<boolean> {
  try {
    await apiGet("/api/health");
    return true;
  } catch {
    return false;
  }
}
