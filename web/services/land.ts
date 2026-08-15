import { apiGet } from "@/lib/api";

/**
 * Land intelligence — zoning conflicts from the Python engine (PRD §21).
 *
 * Official zoning is modelled, so these demonstrate the detection method rather
 * than reporting confirmed breaches. The backend says so in `note`, and the UI
 * should keep saying so wherever they are shown.
 */

export interface ZoningConflictRow {
  parcelId: string;
  ward: string;
  official: string;
  detected: string;
  type: string;
  severity: "high" | "medium";
  centroid: [number, number];
}

export async function fetchZoningConflicts(): Promise<ZoningConflictRow[]> {
  const res = await apiGet<{
    features: {
      properties: {
        parcel_id: string; ward: string; official: string;
        detected: string; type: string; severity: "high" | "medium";
      };
      geometry: { coordinates: [number, number] };
    }[];
  }>("/api/zoning/conflicts");
  return res.features.map((f) => ({
    parcelId: f.properties.parcel_id,
    ward: f.properties.ward,
    official: f.properties.official,
    detected: f.properties.detected,
    type: f.properties.type,
    severity: f.properties.severity,
    centroid: f.geometry.coordinates,
  }));
}
