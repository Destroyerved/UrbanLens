import { CityConfig, CITIES, DEFAULT_CITY } from "@/lib/engine/config";
import type { CityDataset } from "@/lib/engine/types";
import { generateCity } from "@/lib/engine/data/generate";

/**
 * The generated dataset is deterministic and moderately expensive, so we build
 * it once per city and cache it on globalThis to survive Next.js dev HMR.
 */
const g = globalThis as unknown as { __urbanlens__?: Map<string, CityDataset> };
const cache: Map<string, CityDataset> = g.__urbanlens__ ?? new Map();
g.__urbanlens__ = cache;

export function getCityConfig(cityId?: string): CityConfig {
  if (cityId && CITIES[cityId]) return CITIES[cityId];
  return DEFAULT_CITY;
}

export function getDataset(cityId?: string): CityDataset {
  const config = getCityConfig(cityId);
  const cached = cache.get(config.id);
  if (cached) return cached;
  const ds = generateCity(config);
  cache.set(config.id, ds);
  return ds;
}
