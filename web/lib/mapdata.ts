import type { FeatureCollection } from "geojson";
import type { LandUse, Year } from "@/types";
import { PARCELS } from "@/data/parcels";
import { WARDS } from "@/data/wards";
import { ROADS } from "@/data/roads";
import { FACILITIES } from "@/data/facilities";
import { GRID, BUILTUP_RINGS, urbanPosition } from "@/data/grid";
import { VEGETATION } from "@/data/vegetation";
import { GREENSPACE } from "@/data/greenspace";
import { API_BASE } from "@/lib/api";

/**
 * GeoJSON adapters for the MapLibre layer stack.
 *
 * Each is a function rather than a constant because the layer modules swap
 * their contents when the study area changes. The cache keys on the source
 * array's identity — `setParcels()` and friends replace the array, so a stale
 * collection invalidates itself without any version number to keep in sync.
 */
function memo<S, T>(build: (src: S) => T) {
  let lastSrc: S | undefined;
  let lastOut: T;
  return (src: S): T => {
    if (src !== lastSrc) {
      lastSrc = src;
      lastOut = build(src);
    }
    return lastOut;
  };
}

const build_parcelsFC = memo((src: typeof PARCELS): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.map((p) => ({
    type: "Feature",
    id: p.id,
    properties: {
      id: p.id,
      ward: p.wardId,
      areaHa: p.areaHa,
      ownership: p.ownership,
      zoning: p.zoning,
      landUse: p.landUse,
      use2018: p.landUseByYear[2018],
      use2022: p.landUseByYear[2022],
      use2026: p.landUseByYear[2026],
      conflict: p.zoningConflict,
      government: p.ownership === "government",
    },
    geometry: { type: "Polygon", coordinates: [p.ring] },
  })),
}));
export const parcelsFC = (): FeatureCollection => build_parcelsFC(PARCELS);

const build_wardsFC = memo((src: typeof WARDS): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.map((w) => ({
    type: "Feature",
    id: w.id,
    properties: { id: w.id, name: w.name, population: w.population[2026] },
    geometry: { type: "Polygon", coordinates: [w.ring] },
  })),
}));
export const wardsFC = (): FeatureCollection => build_wardsFC(WARDS);

const build_roadsFC = memo((src: typeof ROADS): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.map((r) => ({
    type: "Feature",
    properties: { id: r.id, name: r.name, importance: r.importance },
    geometry: { type: "LineString", coordinates: r.path },
  })),
}));
export const roadsFC = (): FeatureCollection => build_roadsFC(ROADS);

const build_facilitiesFC = memo((src: typeof FACILITIES): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.map((f) => ({
    type: "Feature",
    properties: { id: f.id, name: f.name, ftype: f.type },
    geometry: { type: "Point", coordinates: f.coord },
  })),
}));
export const facilitiesFC = (): FeatureCollection => build_facilitiesFC(FACILITIES);

export function builtupFC(year: Year): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { year },
        geometry: { type: "Polygon", coordinates: [BUILTUP_RINGS[year]] },
      },
    ],
  };
}

const build_predictionFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.filter((c) => c.inCity && c.growthProb > 0.16).map((c) => ({
    type: "Feature",
    properties: { p: Math.round(c.growthProb * 100) / 100 },
    geometry: { type: "Polygon", coordinates: [c.ring] },
  })),
}));
export const predictionFC = (): FeatureCollection => build_predictionFC(GRID);

const build_populationFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.filter((c) => c.population > 500).map((c) => ({
    type: "Feature",
    properties: { pop: c.population },
    geometry: { type: "Point", coordinates: c.center },
  })),
}));
export const populationFC = (): FeatureCollection => build_populationFC(GRID);

/** Cells with meaningful population that sit beyond hospital service reach. */
const build_gapFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.filter((c) => c.inCity && c.population > 1500 && c.hospitalDistKm > 3.5).map(
    (c) => ({
      type: "Feature",
      properties: { pop: c.population, dist: Math.round(c.hospitalDistKm * 10) / 10 },
      geometry: { type: "Polygon", coordinates: [c.ring] },
    })
  ),
}));
export const gapFC = (): FeatureCollection => build_gapFC(GRID);

/** Continuous 2030 Growth Pressure Heatmap source */
const build_growthHeatFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.filter((c) => c.inCity && c.growthProb > 0.05).map((c) => ({
    type: "Feature",
    properties: { weight: c.growthProb },
    geometry: { type: "Point", coordinates: c.center },
  })),
}));
export const growthHeatFC = (): FeatureCollection => build_growthHeatFC(GRID);

/** Healthcare / Infrastructure Deficit Heatmap source */
const build_gapHeatFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.filter((c) => c.inCity && c.population > 800).map((c) => {
    const gapScore = (c.population / 1000) * Math.max(0, c.hospitalDistKm - 2.0);
    return {
      type: "Feature",
      properties: { weight: Math.min(100, gapScore) },
      geometry: { type: "Point", coordinates: c.center },
    };
  }),
}));
export const gapHeatFC = (): FeatureCollection => build_gapHeatFC(GRID);

/** Vegetation & NDVI — per-ward choropleth from the real Sentinel-2 layer. */
export const vegetationFC = (): FeatureCollection => VEGETATION;
export const greenspaceFC = (): FeatureCollection => GREENSPACE;

/** Metro extent the LST raster covers (matches backend BBOX). */
export const THERMAL_BOUNDS: [number, number, number, number] = [72.0893, 22.7706, 72.8426, 23.4355];

/** Raster URL for the committed LST layer; `updated_at` busts the browser cache. */
export const thermalRasterURL = (updatedAt?: string): string =>
  `${API_BASE}/static/thermal/latest.png${updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : ""}`;

export const LANDUSE_COLORS: Record<LandUse, string> = {
  agriculture: "#84cc16",
  vegetation: "#22c55e",
  water: "#38bdf8",
  vacant: "#9ca3af",
  residential: "#eab308",
  commercial: "#a855f7",
  industrial: "#94a3b8",
  mixed: "#fb923c",
  public: "#3b82f6",
};

export const FACILITY_COLORS: Record<string, string> = {
  hospital: "#f43f5e",
  clinic: "#fb7185",
  school: "#8b5cf6",
  park: "#22c55e",
  transit: "#06b6d4",
  fire: "#f97316",
  police: "#6366f1",
  govt: "#3b82f6",
};

export const FACILITY_LABELS: Record<string, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  school: "School",
  park: "Park",
  transit: "Transit",
  fire: "Fire Station",
  police: "Police",
  govt: "Govt Office",
};

/** MapLibre expression: parcel colour from a land-use property. */
export function landUseColorExpr(prop: string): unknown[] {
  const expr: unknown[] = ["match", ["get", prop]];
  for (const [use, color] of Object.entries(LANDUSE_COLORS)) expr.push(use, color);
  expr.push("#888888");
  return expr;
}
