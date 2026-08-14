import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection, LineString, Point } from "geojson";
import type { FacilityProps, RoadProps } from "@/lib/types";

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

export interface RealData {
  facilities: FeatureCollection<Point, FacilityProps>;
  roads: FeatureCollection<LineString, RoadProps>;
  meta: { fetchedAt: string; source: string };
}

function decimate(coords: number[][], max = 14): number[][] {
  if (coords.length <= max) return coords;
  const step = Math.ceil(coords.length / max);
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

let cached: RealData | null | undefined;

export function loadRealData(): RealData | null {
  if (cached !== undefined) return cached;
  try {
    const fPath = join(DIR, "facilities.json");
    const rPath = join(DIR, "roads.json");
    if (!existsSync(fPath) || !existsSync(rPath)) {
      cached = null;
      return null;
    }
    const rawF = JSON.parse(readFileSync(fPath, "utf8")) as FeatureCollection<Point, FacilityProps>;
    const rawR = JSON.parse(readFileSync(rPath, "utf8")) as FeatureCollection<LineString, RoadProps>;

    // Reclassify hospitals → clinics unless mapped as a building (OSM way) or the
    // name clearly denotes a major hospital.
    const reclassified = rawF.features.map((f) => {
      const isWay = f.properties.id.startsWith("OSM-W");
      if (f.properties.facility_type === "hospital" && !isWay && !MAJOR_HOSPITAL.test(f.properties.name)) {
        return { ...f, properties: { ...f.properties, facility_type: "clinic" as const } };
      }
      return f;
    });

    // Merge near-duplicate points of the same type on a ~150 m grid.
    const seen = new Set<string>();
    const facilities = reclassified.filter((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const key = `${f.properties.facility_type}:${lng.toFixed(3)}:${lat.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const roads = rawR.features.map((r) => ({
      ...r,
      geometry: { type: "LineString" as const, coordinates: decimate(r.geometry.coordinates) },
    }));

    let meta = { fetchedAt: "", source: "OpenStreetMap via Overpass API" };
    try {
      meta = { ...meta, ...JSON.parse(readFileSync(join(DIR, "meta.json"), "utf8")) };
    } catch {}

    cached = {
      facilities: { type: "FeatureCollection", features: facilities },
      roads: { type: "FeatureCollection", features: roads },
      meta,
    };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
