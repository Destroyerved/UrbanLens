import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { growthSummary } from "@/lib/engine/gis/engine";
import { cityIdFrom, json } from "@/lib/engine/api";

/**
 * Historical urban expansion (PRD §56 `/api/growth/history`). Same payload as
 * `/api/growth`, which the UI calls; this is the spec-named path.
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  return json(growthSummary(ds));
}
