import type { FeatureCollection } from "geojson";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
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

/** Module-level cache so heavy GeoJSON layers load once per session. */
const geoCache = new Map<string, Promise<FeatureCollection>>();

const GEO_ENDPOINTS: Record<string, string> = {
  parcels: "/api/parcels",
  wards: "/api/wards",
  facilities: "/api/facilities",
  roads: "/api/roads",
  prediction: "/api/growth/prediction",
};

export function loadGeo(key: keyof typeof GEO_ENDPOINTS | string): Promise<FeatureCollection> {
  const url = GEO_ENDPOINTS[key] ?? key;
  if (!geoCache.has(url)) geoCache.set(url, api<FeatureCollection>(url));
  return geoCache.get(url)!;
}
