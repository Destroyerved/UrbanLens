import type { FeatureCollection } from "geojson";

/**
 * Active city for every API call. Every route already accepts `?city=`, so the
 * client keeps one module-level value and stamps it onto each request rather
 * than threading a prop through every page. CityProvider owns this value.
 */
let currentCity = "ahmedabad";

export function setApiCity(cityId: string) {
  if (cityId === currentCity) return;
  currentCity = cityId;
  // Cached layers belong to the previous city.
  geoCache.clear();
}

export function getApiCity(): string {
  return currentCity;
}

/** Appends the active city to an app-relative API path. */
export function withCity(path: string): string {
  if (!path.startsWith("/api/")) return path;
  return path + (path.includes("?") ? "&" : "?") + "city=" + encodeURIComponent(currentCity);
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = withCity(path);
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function postJSON<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Module-level cache so heavy GeoJSON layers load once per city per session. */
const geoCache = new Map<string, Promise<FeatureCollection>>();

const GEO_ENDPOINTS: Record<string, string> = {
  parcels: "/api/parcels",
  wards: "/api/wards",
  facilities: "/api/facilities",
  roads: "/api/roads",
  prediction: "/api/growth/prediction",
  population: "/api/population",
  conflicts: "/api/zoning/conflicts",
};

export function loadGeo(key: keyof typeof GEO_ENDPOINTS | string): Promise<FeatureCollection> {
  const path = GEO_ENDPOINTS[key] ?? key;
  const cacheKey = `${currentCity}:${path}`;
  if (!geoCache.has(cacheKey)) geoCache.set(cacheKey, api<FeatureCollection>(path));
  return geoCache.get(cacheKey)!;
}
