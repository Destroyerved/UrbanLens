import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { zoningConflicts } from "@/lib/engine/gis/engine";
import { cityIdFrom, json } from "@/lib/engine/api";

/**
 * Parcels whose detected land use diverges from their official designation
 * (PRD §21), returned as GeoJSON so the map can render them directly.
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const conflicts = zoningConflicts(ds);
  const bySeverity = { high: 0, medium: 0 };
  for (const c of conflicts) bySeverity[c.severity]++;

  return json({
    type: "FeatureCollection",
    properties: { count: conflicts.length, high: bySeverity.high, medium: bySeverity.medium },
    features: conflicts.map((c) => ({
      type: "Feature",
      id: c.parcel_id,
      properties: {
        parcel_id: c.parcel_id,
        ward: c.ward,
        official: c.official,
        detected: c.detected,
        type: c.type,
        severity: c.severity,
      },
      geometry: { type: "Point", coordinates: c.centroid },
    })),
  });
}
