import type { Mode } from "@/types";

export type LayerId =
  | "wards"
  | "parcels"
  | "govt-land"
  | "zoning-conflicts"
  | "flood-risk"
  | "roads"
  | "facilities"
  | "population"
  | "growth-heat"
  | "gap-heat"
  | "ndvi-heat"
  | "thermal-heat"
  | "greenspace"
  | "builtup"
  | "prediction"
  | "gap"
  | "candidates";

export type LayerCategory = "Land" | "Infrastructure" | "Intelligence" | "Heatmaps";

export type BasemapType =
  | "dark"
  | "light"
  | "satellite"
  | "hybrid"
  | "streets"
  | "terrain";

export interface BasemapDef {
  id: BasemapType;
  label: string;
  category: "Vector" | "Satellite" | "Topography";
  description: string;
  icon: string;
}

export const BASEMAPS: BasemapDef[] = [
  {
    id: "satellite",
    label: "Satellite",
    category: "Satellite",
    description: "High-resolution satellite imagery",
    icon: "🛰️",
  },
  {
    id: "hybrid",
    label: "Hybrid Satellite",
    category: "Satellite",
    description: "Satellite with road and boundary labels",
    icon: "🌐",
  },
  {
    id: "streets",
    label: "Vector Streets",
    category: "Vector",
    description: "Detailed city streets & POI vectors",
    icon: "🗺️",
  },
  {
    id: "terrain",
    label: "Topographic / Terrain",
    category: "Topography",
    description: "Elevation contours & land relief",
    icon: "⛰️",
  },
  {
    id: "dark",
    label: "Dark Matter",
    category: "Vector",
    description: "High-contrast dark GIS canvas",
    icon: "🌙",
  },
  {
    id: "light",
    label: "Positron Light",
    category: "Vector",
    description: "Clean light planning canvas",
    icon: "☀️",
  },
];

export interface LayerDef {
  id: LayerId;
  label: string;
  category: LayerCategory;
  description: string;
  hasOpacity?: boolean;
}

export const LAYERS: LayerDef[] = [
  { id: "parcels", label: "GLIS Parcels", category: "Land", description: "Land parcels coloured by current use" },
  { id: "govt-land", label: "Government Land", category: "Land", description: "Government-owned parcels highlighted" },
  { id: "zoning-conflicts", label: "Zoning Conflicts", category: "Land", description: "Official designation vs detected use" },
  { id: "flood-risk", label: "Flood Risk", category: "Intelligence", description: "Modelled flood susceptibility (DEM + water proximity)", hasOpacity: true },
  { id: "wards", label: "Ward Boundaries", category: "Land", description: "Administrative planning zones" },
  { id: "roads", label: "Road Network", category: "Infrastructure", description: "Arterial roads & highways" },
  { id: "facilities", label: "Public Facilities", category: "Infrastructure", description: "Hospitals, schools, parks, transit…" },
  { id: "population", label: "Population Density Heatmap", category: "Heatmaps", description: "Continuous population distribution", hasOpacity: true },
  { id: "growth-heat", label: "2030 Growth Pressure Heatmap", category: "Heatmaps", description: "Observed-growth-informed expansion hotspots", hasOpacity: true },
  { id: "gap-heat", label: "Healthcare Gap Heatmap", category: "Heatmaps", description: "Underserved population deficit intensity", hasOpacity: true },
  { id: "ndvi-heat", label: "Vegetation & NDVI Canopy", category: "Heatmaps", description: "Green cover & ecological corridors", hasOpacity: true },
  { id: "greenspace", label: "Green Space", category: "Heatmaps", description: "Parks & green land parcels", hasOpacity: true },
  { id: "thermal-heat", label: "Urban Heat Island (UHI)", category: "Heatmaps", description: "Surface thermal stress intensity", hasOpacity: true },
  { id: "builtup", label: "Built-Up Spread", category: "Intelligence", description: "Fluid Esri built-up intensity (2018, 2022, 2024)", hasOpacity: true },
  { id: "prediction", label: "2030 Expansion Likelihood", category: "Intelligence", description: "Fluid likelihood from Esri growth and development pressure", hasOpacity: true },
  { id: "gap", label: "Infrastructure Gap Intensity", category: "Intelligence", description: "Fluid population-weighted hospital access deficit", hasOpacity: true },
  { id: "candidates", label: "Site Candidates", category: "Intelligence", description: "Ranked recommendation results" },
];

export const MODE_PRESETS: Record<Mode, LayerId[]> = {
  overview: ["wards", "parcels", "roads", "facilities"],
  growth: ["wards", "roads", "builtup"],
  infrastructure: ["wards", "roads", "facilities", "gap"],
  land: ["wards", "parcels", "govt-land", "zoning-conflicts", "roads"],
  sites: ["wards", "parcels", "roads", "candidates"],
  simulator: ["wards", "roads", "facilities", "candidates"],
  // Equity reads at ward scale: boundaries plus the population and gap
  // surfaces the index is computed from. Parcels would only add noise.
  equity: ["wards", "population", "gap", "facilities"],
  // Conservation reads the environmental surfaces it scores against.
  conservation: ["wards", "greenspace", "ndvi-heat", "flood-risk", "prediction"],
  // A corridor is argued about against terrain and what it would serve.
  corridor: ["wards", "roads", "population", "flood-risk", "greenspace"],
};

export const MODE_META: Record<
  Mode,
  { label: string; caption: string }
> = {
  overview: { label: "Overview", caption: "City command center" },
  growth: { label: "Urban Growth", caption: "Time machine & 2030 prediction" },
  infrastructure: { label: "Infrastructure", caption: "Gap & accessibility analysis" },
  land: { label: "Land Intelligence", caption: "GLIS parcels & opportunities" },
  sites: { label: "Site Selection", caption: "Explainable site recommendation" },
  simulator: { label: "Simulator", caption: "What-if impact analysis" },
  equity: { label: "Service Equity", caption: "Who is underserved, and by how much" },
  conservation: { label: "Conservation", caption: "Ecology under development pressure" },
  corridor: { label: "Corridor", caption: "Least-cost route for linear infrastructure" },
};
