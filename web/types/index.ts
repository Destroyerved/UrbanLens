/**
 * UrbanLens core domain types.
 * These mirror the future FastAPI/PostGIS schema (see PRD §48–58) so that the
 * mock service layer can later be swapped for real API calls without
 * touching components.
 */

export const MODES = [
  "overview",
  "growth",
  "infrastructure",
  "land",
  "sites",
  "simulator",
  "equity",
  "conservation",
  "corridor",
] as const;

export type Mode = (typeof MODES)[number];

/** Scrubber years are the observed satellite epochs; 2026 is the projection year. */
export type Year = 2018 | 2022 | 2024 | 2026;
export const YEARS: Year[] = [2018, 2022, 2024];

export type LandUse =
  | "agriculture"
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed"
  | "vacant"
  | "vegetation"
  | "water"
  | "public";

export type Ownership = "government" | "private";
export type RiskLevel = "low" | "medium" | "high";

export type LngLat = [number, number];

export interface Parcel {
  id: string;
  surveyNumber: string;
  wardId: string;
  centroid: LngLat;
  /** Closed polygon ring, [lng, lat][] */
  ring: LngLat[];
  areaHa: number;
  ownership: Ownership;
  zoning: LandUse;
  landUse: LandUse;
  landUseByYear: Record<Year, LandUse>;
  builtUpPct: number;
  vegetationPct: number;
  roadDistKm: number;
  hospitalDistKm: number;
  schoolDistKm: number;
  parkDistKm: number;
  transitDistKm: number;
  population3km: number;
  floodRisk: RiskLevel;
  /** 0–100, utilities/electricity/drainage readiness */
  infraReadiness: number;
  /** 0–100, higher = more ecologically sensitive */
  envSensitivity: number;
  /** 0–100 development potential, scored by the engine and carried with the parcel. */
  developmentPotential: number;
  /** Flagged by the engine's zoning rule; see /api/zoning/conflicts. */
  zoningConflict: boolean;
}

export interface Ward {
  id: string;
  name: string;
  ring: LngLat[];
  centroid: LngLat;
  areaKm2: number;
  population: Record<Year, number>;
}

export type FacilityType =
  | "hospital"
  | "clinic"
  | "school"
  | "park"
  | "transit"
  | "fire"
  | "police"
  | "govt";

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  coord: LngLat;
  wardId: string;
}

export interface Road {
  id: string;
  name: string;
  importance: "arterial" | "highway" | "major";
  path: LngLat[];
}

/** Analysis grid cell (~1.1 km). Stand-in for a PostGIS raster/grid. */
export interface GridCell {
  id: string;
  center: LngLat;
  ring: LngLat[];
  population: number;
  wardId: string;
  /** 0–1 probability of urbanization by 2030 */
  growthProb: number;
  hospitalDistKm: number;
  inCity: boolean;
  /** Observed built-up fraction (0–1) per satellite epoch, when available. */
  built?: Partial<Record<Year, number>>;
}

export type ProjectType =
  | "hospital"
  | "school"
  | "park"
  | "transit"
  | "fire"
  | "govt"
  | "residential"
  | "affordable"
  | "commercial"
  | "industrial"
  | "warehouse"
  | "logistics"
  | "mixed";

export interface SuitabilityWeights {
  accessibility: number;
  populationNeed: number;
  transit: number;
  infrastructure: number;
  environment: number;
  landCompatibility: number;
}

export const DEFAULT_WEIGHTS: SuitabilityWeights = {
  accessibility: 25,
  populationNeed: 20,
  transit: 15,
  infrastructure: 15,
  environment: 15,
  landCompatibility: 10,
};

export const DEFAULT_CONSTRAINTS: SiteConstraints = {
  minAreaHa: 4,
  governmentOnly: true,
  maxRoadDistKm: 2.5,
  lowFloodOnly: false,
  maxEnvSensitivity: 60,
  maxBuiltUpPct: 40,
  excludeFloodHazard: false,
};

export interface SiteConstraints {
  minAreaHa: number;
  governmentOnly: boolean;
  maxRoadDistKm: number;
  lowFloodOnly: boolean;
  maxEnvSensitivity: number;
  maxBuiltUpPct?: number;
  excludeFloodHazard?: boolean;
}

export interface FactorScore {
  key: keyof SuitabilityWeights;
  label: string;
  score: number; // 0–100
  weight: number; // 0–100
  detail: string;
}

export interface SuitabilityResult {
  parcelId: string;
  score: number;
  factors: FactorScore[];
  strengths: string[];
  concerns: string[];
}

export interface SiteCandidate extends SuitabilityResult {
  rank: number;
  parcel: Parcel;
}

export interface CoverageStats {
  coveragePct: number;
  avgDistKm: number;
  coveredPop: number;
  totalPop: number;
}

export interface SimulationResult {
  projectType: ProjectType;
  parcelId: string;
  wardName: string;
  serviceRadiusKm: number;
  before: CoverageStats;
  after: CoverageStats;
  /** Stats restricted to the 6 km catchment corridor around the site. */
  corridorBefore: CoverageStats;
  corridorAfter: CoverageStats;
  newlyCovered: number;
  accessibilityBefore: number;
  accessibilityAfter: number;
  livabilityBefore: number;
  livabilityAfter: number;
  center: [number, number];
  radiusKm: number;
}

export type GapCategory =
  | "healthcare"
  | "education"
  | "parks"
  | "transport"
  | "safety";

export interface WardGap {
  wardId: string;
  wardName: string;
  population: number;
  scores: Record<GapCategory, number>;
  overall: number;
  affectedPopulation: number;
}

export interface AccessibilityItem {
  label: string;
  minutes: number;
  ok: boolean;
}

export interface AccessibilityReport {
  items: AccessibilityItem[];
  score: number;
}

export interface GrowthStats {
  year: Year;
  builtUpKm2: number;
  transitions: { from: LandUse; to: LandUse; areaHa: number }[];
}

export interface ZoningConflict {
  parcelId: string;
  official: LandUse;
  detected: LandUse;
  severity: "moderate" | "high";
}

export interface SearchedLocation {
  id: string;
  name: string;
  coord: LngLat;
  address?: string;
  category_label?: string;
  zoom?: number;
  description?: string;
}

/** Actions the Copilot (and search palette) can trigger on the map/app. */
export type MapAction =
  | { type: "flyTo"; center: LngLat; zoom?: number; pitch?: number; bearing?: number }
  | { type: "selectParcel"; parcelId: string; fly?: boolean }
  | { type: "pinpointLocation"; location: SearchedLocation }
  | { type: "clearPinpoint" }
  | { type: "setMode"; mode: Mode }
  | { type: "enableLayer"; layerId: string }
  | { type: "disableLayer"; layerId: string }
  | { type: "toggleLayer"; layerId: string; on?: boolean }
  | { type: "setBasemap"; basemap: "satellite" | "hybrid" | "streets" | "terrain" | "dark" | "light" }
  | { type: "setCity"; cityId: string }
  | { type: "highlightWards"; wardIds: string[] }
  | { type: "setYear"; year: Year }
  | { type: "enablePrediction" }
  | { type: "runSiteAnalysis"; project?: ProjectType }
  | { type: "runSimulation"; parcelId?: string; project?: ProjectType }
  | { type: "resetView" }
  | { type: "set3D"; pitch?: number };

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: { label: string; action: MapAction }[];
  thinking?: boolean;
}
