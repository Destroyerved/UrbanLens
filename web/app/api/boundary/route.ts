import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { getCityConfig } from "@/lib/engine/data/store";
import { cityIdFrom, json } from "@/lib/engine/api";

export async function GET(req: NextRequest) {
  const cityId = cityIdFrom(req);
  const ds = getDataset(cityId);
  const config = getCityConfig(cityId);
  return json({ boundary: ds.boundary, config });
}
