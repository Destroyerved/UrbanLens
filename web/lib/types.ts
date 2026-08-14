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
}

export type Ward = Feature<Polygon, WardProps>;

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

/** The full generated city, held in memory and served to the API layer. */
export interface CityDataset {
  cityId: string;
  generatedAt: string;
  provenance: "demo";
  sources: {
    facilities: "osm" | "synthetic";
    roads: "osm" | "synthetic";
    parcels: "synthetic";
    wards: "synthetic";
  };
  boundary: Feature<Polygon | MultiPolygon>;
  wards: FeatureCollection<Polygon, WardProps>;
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
