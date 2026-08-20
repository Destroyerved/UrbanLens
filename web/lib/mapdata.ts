import type { FeatureCollection } from "geojson";
import type { GridCell, LandUse, Year } from "@/types";
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
      floodRisk: p.floodRisk,
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
  // The bootstrap carries one observed built-up share per display-grid cell.
  // Publish cell centres as weighted points rather than cell polygons so the
  // map can render a continuous intensity field, not a chessboard of squares.
  const observed = GRID.filter(
    (c) => (c.built?.[year] ?? 0) >= 0.01 && c.built?.[year] !== undefined,
  );
  if (observed.length > 0) {
    return {
      type: "FeatureCollection",
      features: observed.map((c) => ({
        type: "Feature",
        properties: {
          year,
          // `amount` drives the MapLibre heatmap's opacity/intensity.
          amount: Math.round((c.built?.[year] ?? 0) * 1000) / 1000,
        },
        geometry: { type: "Point", coordinates: c.center },
      })),
    };
  }
  // Fresh clones without the observed pass still receive a soft, illustrative
  // centre rather than an incompatible polygon source.
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { year, amount: 1 },
        geometry: { type: "Point", coordinates: BUILTUP_RINGS[year][0] },
      },
    ],
  };
}

/**
 * A bounded 2030 expansion-likelihood score. The prebuilt pressure model is
 * strengthened by measured Esri built-up change (2018–2024), then reduced on
 * land that was already built in 2024. It is intentionally a likelihood
 * surface, rather than claiming a calibrated parcel-level forecast.
 */
export function growthLikelihood(cell: GridCell): number {
  const pressure = Math.max(0, Math.min(1, cell.growthProb));
  const observed = cell.built;
  if (!observed) return pressure;

  const b18 = observed[2018] ?? 0;
  const b22 = observed[2022] ?? b18;
  const b24 = observed[2024] ?? b22;
  const longTermGrowth = Math.max(0, Math.min(1, (b24 - b18) / 0.3));
  const recentGrowth = Math.max(0, Math.min(1, (b24 - b22) / 0.18));
  const availableLand = Math.max(0, Math.min(1, 1 - b24));

  return Math.max(
    0,
    Math.min(1, availableLand * (pressure * 0.48 + longTermGrowth * 0.32 + recentGrowth * 0.2)),
  );
}

const build_predictionFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  // Centred, weighted points let MapLibre render a continuous likelihood
  // field instead of exposing the display grid as square prediction cells.
  features: src.map((c) => ({ cell: c, p: growthLikelihood(c) }))
    .filter(({ cell, p }) => cell.inCity && p > 0.035)
    .map(({ cell, p }) => ({
      type: "Feature",
      properties: { p: Math.round(p * 1000) / 1000 },
      geometry: { type: "Point", coordinates: cell.center },
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

/** Population-weighted hospital-access deficit, normalised for map opacity. */
export function infrastructureGapScore(cell: GridCell): number {
  const accessShortfall = Math.max(0, Math.min(1, (cell.hospitalDistKm - 3.5) / 6.5));
  const peopleAffected = Math.max(0, Math.min(1, (cell.population - 1500) / 18500));
  return accessShortfall * Math.sqrt(peopleAffected);
}

/** Population with a meaningful hospital-access deficit. */
const build_gapFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.map((c) => ({ cell: c, score: infrastructureGapScore(c) }))
    .filter(({ cell, score }) => cell.inCity && score > 0.025)
    .map(({ cell, score }) => ({
      type: "Feature",
      properties: {
        score: Math.round(score * 1000) / 1000,
        pop: cell.population,
        dist: Math.round(cell.hospitalDistKm * 10) / 10,
      },
      geometry: { type: "Point", coordinates: cell.center },
    })),
}));
export const gapFC = (): FeatureCollection => build_gapFC(GRID);

/** Continuous 2030 Growth Pressure Heatmap source */
const build_growthHeatFC = memo((src: typeof GRID): FeatureCollection => ({
  type: "FeatureCollection",
  features: src.map((c) => ({ cell: c, p: growthLikelihood(c) }))
    .filter(({ cell, p }) => cell.inCity && p > 0.035)
    .map(({ cell, p }) => ({
    type: "Feature",
    properties: { weight: p },
    geometry: { type: "Point", coordinates: cell.center },
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
