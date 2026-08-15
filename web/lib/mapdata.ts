import type { FeatureCollection } from "geojson";
import type { LandUse, Year } from "@/types";
import { PARCELS } from "@/data/parcels";
import { WARDS } from "@/data/wards";
import { ROADS } from "@/data/roads";
import { FACILITIES } from "@/data/facilities";
import { GRID, BUILTUP_RINGS, urbanPosition } from "@/data/grid";

/** GeoJSON adapters for the MapLibre layer stack (built once, module-level). */

export const parcelsFC: FeatureCollection = {
  type: "FeatureCollection",
  features: PARCELS.map((p) => ({
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
};

export const wardsFC: FeatureCollection = {
  type: "FeatureCollection",
  features: WARDS.map((w) => ({
    type: "Feature",
    id: w.id,
    properties: { id: w.id, name: w.name, population: w.population[2026] },
    geometry: { type: "Polygon", coordinates: [w.ring] },
  })),
};

export const roadsFC: FeatureCollection = {
  type: "FeatureCollection",
  features: ROADS.map((r) => ({
    type: "Feature",
    properties: { id: r.id, name: r.name, importance: r.importance },
    geometry: { type: "LineString", coordinates: r.path },
  })),
};

export const facilitiesFC: FeatureCollection = {
  type: "FeatureCollection",
  features: FACILITIES.map((f) => ({
    type: "Feature",
    properties: { id: f.id, name: f.name, ftype: f.type },
    geometry: { type: "Point", coordinates: f.coord },
  })),
};

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

export const predictionFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.inCity && c.growthProb > 0.16).map((c) => ({
    type: "Feature",
    properties: { p: Math.round(c.growthProb * 100) / 100 },
    geometry: { type: "Polygon", coordinates: [c.ring] },
  })),
};

export const populationFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.population > 500).map((c) => ({
    type: "Feature",
    properties: { pop: c.population },
    geometry: { type: "Point", coordinates: c.center },
  })),
};

/** Cells with meaningful population that sit beyond hospital service reach. */
export const gapFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.inCity && c.population > 1500 && c.hospitalDistKm > 3.5).map(
    (c) => ({
      type: "Feature",
      properties: { pop: c.population, dist: Math.round(c.hospitalDistKm * 10) / 10 },
      geometry: { type: "Polygon", coordinates: [c.ring] },
    })
  ),
};

/** Continuous 2030 Growth Pressure Heatmap source */
export const growthHeatFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.inCity && c.growthProb > 0.05).map((c) => ({
    type: "Feature",
    properties: { weight: c.growthProb },
    geometry: { type: "Point", coordinates: c.center },
  })),
};

/** Healthcare / Infrastructure Deficit Heatmap source */
export const gapHeatFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.inCity && c.population > 800).map((c) => {
    const gapScore = (c.population / 1000) * Math.max(0, c.hospitalDistKm - 2.0);
    return {
      type: "Feature",
      properties: { weight: Math.min(100, gapScore) },
      geometry: { type: "Point", coordinates: c.center },
    };
  }),
};

/** Vegetation & Ecological NDVI Canopy Heatmap source */
export const ndviHeatFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.inCity).map((c) => {
    const { rKm } = urbanPosition(c.center);
    const ndvi = Math.max(0.1, Math.min(0.95, 0.2 + (rKm / 14) * 0.6 + (c.id.charCodeAt(5) % 10) * 0.02));
    return {
      type: "Feature",
      properties: { weight: ndvi },
      geometry: { type: "Point", coordinates: c.center },
    };
  }),
};

/** Urban Heat Island (UHI) Thermal Stress Heatmap source */
export const thermalHeatFC: FeatureCollection = {
  type: "FeatureCollection",
  features: GRID.filter((c) => c.inCity).map((c) => {
    const { rKm } = urbanPosition(c.center);
    const thermal = Math.max(0.08, 1.0 - (rKm / 12) * 0.72);
    return {
      type: "Feature",
      properties: { weight: thermal },
      geometry: { type: "Point", coordinates: c.center },
    };
  }),
};

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
