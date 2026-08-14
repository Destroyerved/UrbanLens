import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { growthSummary } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

/**
 * Historical urban expansion (PRD §56 `/api/growth/history`). Same payload as
 * `/api/growth`, which the UI calls; this is the spec-named path.
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  return json(growthSummary(ds));
}
