import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Point,
  LineString,
} from "geojson";

export type Ownership = "government" | "private";

export type LandUse =
  | "residential"
  | "commercial"
  | "industrial"
  | "institutional"
  | "agriculture"
  | "vacant"
  | "mixed"
  | "green"
  | "water";

export type Zoning =
  | "residential"
  | "commercial"
  | "industrial"
  | "agricultural"
  | "public_semi_public"
  | "recreational"
  | "mixed_use";

export type FacilityType =
  | "hospital"
  | "clinic"
  | "school"
  | "college"
  | "park"
  | "fire_station"
  | "police_station"
  | "bus_stop"
  | "metro_station"
  | "government_office";

export type RiskLevel = "low" | "medium" | "high";

/** The six sub-scores that feed the Urban Development Suitability engine. */
export interface ScoreBreakdown {
  accessibility: number;
  population_need: number;
  transit: number;
  infrastructure: number;
  environment: number;
  land_compatibility: number;
}

export interface ParcelProps {
  id: string;
  parcel_id: string;
  survey_number: string;
  area_sqm: number;
  area_acres: number;
  ownership: Ownership;
  owner_category: string;
  land_use: LandUse;
  zoning: Zoning;
  district: string;
  ward: string; // ward_code
  built_up_percent: number;
  vegetation_percent: number;
  water_percent: number;
  flood_risk: RiskLevel;
  elevation_m: number;
  /** [lng, lat] centroid, precomputed for cheap distance math. */
  centroid: [number, number];
  /** Built-up % snapshots by year — drives growth + change detection. */
  history: Record<number, number>;
  /**
   * Where the parcel's boundary and land use came from. "osm" means a real
   * mapped land polygon; "synthetic" means a generated stand-in. Tenure, official
   * zoning and the built-up attributes are modelled in both cases.
   */
  source?: "osm" | "synthetic";
  /** Originating OSM tag, e.g. "landuse=residential" (real parcels only). */
  osm_tag?: string;
  /** Mapped name of the estate/block, where OSM records one. */
  name?: string | null;
  /** True when OSM explicitly confirms public ownership rather than it being modelled. */
  tenure_known?: boolean;
}

export type Parcel = Feature<Polygon, ParcelProps>;

export interface WardProps {
  id: string;
  name: string;
  ward_code: string;
  district: string;
  population: number;
  area_sqm: number;
  population_density: number; // people / km²
  centroid: [number, number];
  /**
   * Real measured attributes, present only when the ward layer comes from the
   * digitised municipal ward map (see scripts/build-wards.mjs).
   */
  road_length_km?: number;
  road_density?: number; // km of road per km²
  compactness?: number; // Polsby-Popper, 0..1
  perimeter_km?: number;
  /**
   * Municipal ward or peri-urban taluka remnant. These differ by two orders of
   * magnitude in area (~9 km² vs ~500 km²), so anything ranking units has to be
   * able to tell them apart rather than compare them directly.
   */
  kind?: "ward" | "taluka";
  admin_level?: number;
}

/**
 * MultiPolygon is not hypothetical here: clipping a taluka against the municipal
 * footprint routinely yields several disjoint remnants.
 */
export type Ward = Feature<Polygon | MultiPolygon, WardProps>;

export interface FacilityProps {
  id: string;
  name: string;
  facility_type: FacilityType;
  capacity: number;
  source: string;
}

export type Facility = Feature<Point, FacilityProps>;

export interface RoadProps {
  id: string;
  name: string;
  road_type: "arterial" | "highway" | "ring" | "primary" | "river";
  importance: number;
}

export type Road = Feature<LineString, RoadProps>;

export interface PredictionProps {
  id: string;
  prediction_year: number;
  growth_probability: number; // 0..1
  risk_category: "very_low" | "low" | "medium" | "high" | "very_high";
}

export type PredictionCell = Feature<Polygon, PredictionProps>;

/**
 * Where a layer's data actually came from. The product makes planning claims, so
 * every layer states its own provenance rather than the whole app carrying one
 * blanket "demo" flag (PRD §30, §80.12 — real, public and synthetic data must be
 * clearly separated and synthetic data must never be presented as official).
 */
export type LayerSource = "official" | "osm" | "derived" | "synthetic";

export type DataLayerKey =
  | "wards"
  | "population"
  | "parcels"
  | "tenure"
  | "zoning"
  | "facilities"
  | "roads"
  | "prediction";

export interface LayerProvenance {
  source: LayerSource;
  /** Short attribution shown in the UI. */
  label: string;
  /** How the layer was produced — shown on hover / in the data panel. */
  detail: string;
}

export const SOURCE_LABELS: Record<LayerSource, string> = {
  official: "Official",
  osm: "OpenStreetMap",
  derived: "Derived",
  synthetic: "Synthetic",
};

/** Layers a planner must not mistake for authoritative records. */
export const SOURCE_IS_REAL: Record<LayerSource, boolean> = {
  official: true,
  osm: true,
  derived: false,
  synthetic: false,
};

/** The full generated city, held in memory and served to the API layer. */
export interface CityDataset {
  cityId: string;
  generatedAt: string;
  sources: Record<DataLayerKey, LayerProvenance>;
  boundary: Feature<Polygon | MultiPolygon>;
  wards: FeatureCollection<Polygon | MultiPolygon, WardProps>;
  parcels: FeatureCollection<Polygon, ParcelProps>;
  facilities: FeatureCollection<Point, FacilityProps>;
  roads: FeatureCollection<LineString, RoadProps>;
  prediction: FeatureCollection<Polygon, PredictionProps>;
}

export const FACILITY_LABELS: Record<FacilityType, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  school: "School",
  college: "College",
  park: "Park",
  fire_station: "Fire Station",
  police_station: "Police Station",
  bus_stop: "Bus Stop",
  metro_station: "Metro Station",
  government_office: "Government Office",
};

export const LAND_USE_LABELS: Record<LandUse, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  institutional: "Institutional",
  agriculture: "Agriculture",
  vacant: "Vacant",
  mixed: "Mixed Use",
  green: "Green / Open",
  water: "Water Body",
};

export const ZONING_LABELS: Record<Zoning, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  agricultural: "Agricultural",
  public_semi_public: "Public / Semi-Public",
  recreational: "Recreational",
  mixed_use: "Mixed Use",
};
