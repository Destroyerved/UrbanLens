import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { FacilityProps, LandUse, RoadProps, WardProps } from "@/lib/types";

/**
 * Loads the REAL OpenStreetMap layers cached by scripts/fetch-osm.mjs and
 * normalises them for demo use. Returns null when the cache is absent (the app
 * then falls back to fully synthetic layers).
 *
 * Transforms applied here (documented, deterministic):
 *  - `amenity=hospital` in India OSM conflates clinics/nursing homes with real
 *    hospitals, so entries whose name doesn't read like a major hospital are
 *    reclassified as clinics. This keeps healthcare-gap analysis meaningful.
 *  - Near-duplicate points of the same type (multiple mappings of one facility)
 *    are merged on a ~150 m grid.
 *  - Road geometries are decimated to keep spatial math fast.
 */

const DIR = join(process.cwd(), "data", "real");
// India OSM tags many clinics/nursing homes as amenity=hospital. Treat something
// as a real hospital only if it's mapped as a building (OSM way) or its name
// clearly denotes a major facility; everything else becomes a clinic.
const MAJOR_HOSPITAL = /medical college|civil hospital|general hospital|multi.?special|super.?special|institute|trauma|referral|government hospital|govt.? hospital/i;

/**
 * Either layer may be absent — an Overpass fetch can succeed for facilities and
 * be rate-limited for roads. Whichever layer arrived is still used; the caller
 * falls back to the synthetic equivalent for the other.
 */
export interface RealData {
  facilities?: FeatureCollection<Point, FacilityProps>;
  roads?: FeatureCollection<LineString, RoadProps>;
  land?: FeatureCollection<Polygon, RealLandProps>;
  meta: { fetchedAt: string; source: string };
}

/**
 * A real mapped land polygon: a closed OSM way carrying a land-use tag. These
 * are surveyed boundaries of blocks and estates, NOT cadastral title plots —
 * GLIS records are not public.
 */
export interface RealLandProps {
  id: string;
  name: string | null;
  land_use: LandUse;
  /** The originating OSM tag, e.g. "landuse=residential". */
  osm_tag: string;
  /** True only where OSM explicitly indicates public ownership. */
  government: boolean;
  area_sqm: number;
}

function decimate(coords: number[][], max = 14): number[][] {
  if (coords.length <= max) return coords;
  const step = Math.ceil(coords.length / max);
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

/**
 * Real municipal ward boundaries built by scripts/build-wards.mjs from the
 * digitised ward map in <repo>/refined. Geometry and the measured attributes are
 * real; `population` / `population_density` are modelled — see `meta`.
 */
export interface RealWards {
  wards: FeatureCollection<Polygon, WardProps>;
  meta: {
    source: string;
    wards: number;
    area_km2: string;
    bbox: [number, number, number, number];
    real_fields: string[];
    derived_fields: string[];
    population_total: number;
    population_basis: string;
    population_method: string;
  };
}

const wardCache = new Map<string, RealWards | null>();

export function loadRealWards(cityId: string): RealWards | null {
  const hit = wardCache.get(cityId);
  if (hit !== undefined) return hit;
  try {
    const path = join(DIR, `${cityId}_wards.json`);
    if (!existsSync(path)) {
      wardCache.set(cityId, null);
      return null;
    }
    const raw = JSON.parse(readFileSync(path, "utf8")) as FeatureCollection<Polygon, WardProps> & {
      meta: RealWards["meta"];
    };
    const value: RealWards = {
      wards: { type: "FeatureCollection", features: raw.features },
      meta: raw.meta,
    };
    wardCache.set(cityId, value);
    return value;
  } catch {
    wardCache.set(cityId, null);
    return null;
  }
}

const dataCache = new Map<string, RealData | null>();

/** City-scoped OSM cache written by scripts/fetch-osm.mjs. */
function resolve(cityId: string, name: string): string | null {
  const path = join(DIR, `${cityId}_${name}.json`);
  return existsSync(path) ? path : null;
}

export function loadRealData(cityId: string): RealData | null {
  const hit = dataCache.get(cityId);
  if (hit !== undefined) return hit;
  let cached: RealData | null;
  try {
    const fPath = resolve(cityId, "facilities");
    const rPath = resolve(cityId, "roads");
    if (!fPath && !rPath) {
      dataCache.set(cityId, null);
      return null;
    }

    let facilities: FeatureCollection<Point, FacilityProps> | undefined;
    if (fPath) {
      const rawF = JSON.parse(readFileSync(fPath, "utf8")) as FeatureCollection<Point, FacilityProps>;

      // Reclassify hospitals → clinics unless mapped as a building (OSM way) or
      // the name clearly denotes a major hospital.
      const reclassified = rawF.features.map((f) => {
        const isWay = f.properties.id.startsWith("OSM-W");
        if (f.properties.facility_type === "hospital" && !isWay && !MAJOR_HOSPITAL.test(f.properties.name)) {
          return { ...f, properties: { ...f.properties, facility_type: "clinic" as const } };
        }
        return f;
      });

      // Merge near-duplicate points of the same type on a ~150 m grid.
      const seen = new Set<string>();
      const deduped = reclassified.filter((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const key = `${f.properties.facility_type}:${lng.toFixed(3)}:${lat.toFixed(3)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      facilities = { type: "FeatureCollection", features: deduped };
    }

    let roads: FeatureCollection<LineString, RoadProps> | undefined;
    if (rPath) {
      const rawR = JSON.parse(readFileSync(rPath, "utf8")) as FeatureCollection<LineString, RoadProps>;
      roads = {
        type: "FeatureCollection",
        features: rawR.features.map((r) => ({
          ...r,
          geometry: { type: "LineString" as const, coordinates: decimate(r.geometry.coordinates) },
        })),
      };
    }

    let land: FeatureCollection<Polygon, RealLandProps> | undefined;
    const lPath = resolve(cityId, "land");
    if (lPath) {
      land = JSON.parse(readFileSync(lPath, "utf8")) as FeatureCollection<Polygon, RealLandProps>;
    }

    let meta = { fetchedAt: "", source: "OpenStreetMap via Overpass API" };
    try {
      const mPath = resolve(cityId, "meta");
      if (mPath) meta = { ...meta, ...JSON.parse(readFileSync(mPath, "utf8")) };
    } catch {}

    cached = { facilities, roads, land, meta };
    dataCache.set(cityId, cached);
    return cached;
  } catch {
    dataCache.set(cityId, null);
    return null;
  }
}
