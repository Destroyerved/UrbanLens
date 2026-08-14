import type { FacilityType, ScoreBreakdown, Zoning } from "@/lib/types";

// ---------------------------------------------------------------------------
// Normalisation primitives — every score in the platform routes through these,
// so results are deterministic and explainable (no random / black-box numbers).
// ---------------------------------------------------------------------------

export const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));

export const round0 = (v: number) => Math.round(v);

/**
 * Cost → score. Returns 100 when x <= good, 0 when x >= bad, linear between.
 * Used for "smaller is better" quantities like distance-to-facility.
 */
export function decayScore(x: number, good: number, bad: number): number {
  if (x <= good) return 100;
  if (x >= bad) return 0;
  return (100 * (bad - x)) / (bad - good);
}

/** Linear normalise x in [min,max] to 0..100. */
export function norm(x: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((100 * (x - min)) / (max - min));
}

// ---------------------------------------------------------------------------
// Urban Development Suitability weights (spec §18/§19 — user-customisable)
// ---------------------------------------------------------------------------

export interface Weights {
  accessibility: number;
  population_need: number;
  transit: number;
  infrastructure: number;
  environment: number;
  land_compatibility: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  accessibility: 0.25,
  population_need: 0.2,
  transit: 0.15,
  infrastructure: 0.15,
  environment: 0.15,
  land_compatibility: 0.1,
};

export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  accessibility: "Accessibility",
  population_need: "Population Need",
  transit: "Transit",
  infrastructure: "Infrastructure",
  environment: "Environment",
  land_compatibility: "Land Compatibility",
};

/** Weighted UDS score, normalised by total weight so any weights are valid. */
export function finalScore(b: ScoreBreakdown, w: Weights): number {
  const total =
    w.accessibility +
    w.population_need +
    w.transit +
    w.infrastructure +
    w.environment +
    w.land_compatibility;
  if (total === 0) return 0;
  const s =
    b.accessibility * w.accessibility +
    b.population_need * w.population_need +
    b.transit * w.transit +
    b.infrastructure * w.infrastructure +
    b.environment * w.environment +
    b.land_compatibility * w.land_compatibility;
  return clamp(s / total);
}

// ---------------------------------------------------------------------------
// Project specifications (drive site selection + land compatibility rules)
// ---------------------------------------------------------------------------

export type ProjectType =
  | "hospital"
  | "school"
  | "park"
  | "fire_station"
  | "government_office"
  | "residential"
  | "affordable_housing"
  | "commercial"
  | "industrial"
  | "mixed_use";

export interface ProjectSpec {
  key: ProjectType;
  label: string;
  /** Facility type whose scarcity defines "population need" for this project. */
  needFacility?: FacilityType;
  /** Facility this project adds (for the simulator). */
  addsFacility?: FacilityType;
  minAreaHa: number;
  prefersGovernment: boolean;
  preferredZoning: Zoning[];
  /** Service radius (km) used by the impact simulator. */
  serviceRadiusKm: number;
}

export const PROJECTS: Record<ProjectType, ProjectSpec> = {
  hospital: {
    key: "hospital",
    label: "Public Hospital",
    needFacility: "hospital",
    addsFacility: "hospital",
    minAreaHa: 2,
    prefersGovernment: true,
    preferredZoning: ["public_semi_public", "residential", "mixed_use"],
    serviceRadiusKm: 4,
  },
  school: {
    key: "school",
    label: "School",
    needFacility: "school",
    addsFacility: "school",
    minAreaHa: 0.8,
    prefersGovernment: true,
    preferredZoning: ["public_semi_public", "residential", "mixed_use"],
    serviceRadiusKm: 1.5,
  },
  park: {
    key: "park",
    label: "Public Park",
    needFacility: "park",
    addsFacility: "park",
    minAreaHa: 0.5,
    prefersGovernment: true,
    preferredZoning: ["recreational", "residential", "public_semi_public"],
    serviceRadiusKm: 1.2,
  },
  fire_station: {
    key: "fire_station",
    label: "Fire Station",
    needFacility: "fire_station",
    addsFacility: "fire_station",
    minAreaHa: 0.4,
    prefersGovernment: true,
    preferredZoning: ["public_semi_public", "commercial", "mixed_use"],
    serviceRadiusKm: 5,
  },
  government_office: {
    key: "government_office",
    label: "Government Office",
    needFacility: "government_office",
    addsFacility: "government_office",
    minAreaHa: 0.5,
    prefersGovernment: true,
    preferredZoning: ["public_semi_public", "commercial", "mixed_use"],
    serviceRadiusKm: 3,
  },
  residential: {
    key: "residential",
    label: "Residential Development",
    minAreaHa: 1,
    prefersGovernment: false,
    preferredZoning: ["residential", "mixed_use"],
    serviceRadiusKm: 2,
  },
  affordable_housing: {
    key: "affordable_housing",
    label: "Affordable Housing",
    minAreaHa: 1,
    prefersGovernment: true,
    preferredZoning: ["residential", "mixed_use", "public_semi_public"],
    serviceRadiusKm: 2,
  },
  commercial: {
    key: "commercial",
    label: "Commercial Zone",
    minAreaHa: 0.5,
    prefersGovernment: false,
    preferredZoning: ["commercial", "mixed_use"],
    serviceRadiusKm: 2,
  },
  industrial: {
    key: "industrial",
    label: "Industrial Zone",
    minAreaHa: 2,
    prefersGovernment: false,
    preferredZoning: ["industrial"],
    serviceRadiusKm: 3,
  },
  mixed_use: {
    key: "mixed_use",
    label: "Mixed-Use Development",
    minAreaHa: 0.8,
    prefersGovernment: false,
    preferredZoning: ["mixed_use", "commercial", "residential"],
    serviceRadiusKm: 2,
  },
};

/** Qualitative band + colour key for any 0..100 score. */
export function scoreBand(v: number): {
  label: string;
  tone: "critical" | "poor" | "moderate" | "good" | "excellent";
} {
  if (v < 30) return { label: "Critical", tone: "critical" };
  if (v < 50) return { label: "Poor", tone: "poor" };
  if (v < 70) return { label: "Moderate", tone: "moderate" };
  if (v < 85) return { label: "Good", tone: "good" };
  return { label: "Excellent", tone: "excellent" };
}
