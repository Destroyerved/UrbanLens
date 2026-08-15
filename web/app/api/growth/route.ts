import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { growthSummary } from "@/lib/engine/gis/engine";
import { cityIdFrom, json } from "@/lib/engine/api";

export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  return json(growthSummary(ds));
}
