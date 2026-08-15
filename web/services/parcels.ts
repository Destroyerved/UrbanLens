import type { Parcel } from "@/types";
import { PARCELS, PARCEL_BY_ID } from "@/data/parcels";
import { simulateLatency } from "./latency";

/**
 * Parcel service.
 * Mock implementation over the deterministic demo dataset.
 * Backend swap: GET /api/parcels · GET /api/parcels/{id}
 */

export async function fetchParcels(): Promise<Parcel[]> {
  await simulateLatency(120);
  return PARCELS;
}

export async function fetchParcel(id: string): Promise<Parcel | null> {
  await simulateLatency(80);
  return PARCEL_BY_ID.get(id) ?? null;
}
