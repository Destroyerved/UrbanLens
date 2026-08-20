import { PARCELS } from "@/data/parcels";
import { WARD_BY_ID } from "@/data/wards";

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
  // Conflict classification already travels in the signed bootstrap parcel
  // cache. Reusing it makes Land Intelligence instant and avoids waking the
  // backend for a deterministic list we already possess.
  return PARCELS
    .filter((p) => p.zoningConflict)
    .map((p) => {
      const high =
        (p.zoning === "agriculture" && p.builtUpPct > 60) ||
        (p.zoning === "residential" && p.landUse === "industrial");
      return {
        parcelId: p.id,
        ward: WARD_BY_ID.get(p.wardId)?.name ?? p.wardId,
        official: p.zoning,
        detected: p.landUse,
        type: `${p.zoning} → ${p.landUse}`,
        severity: high ? "high" : "medium",
        centroid: p.centroid,
      } as ZoningConflictRow;
    });
}
