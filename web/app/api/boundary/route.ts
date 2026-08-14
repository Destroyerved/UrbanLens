import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { getCityConfig } from "@/lib/data/store";
import { cityIdFrom, json } from "@/lib/api";

export async function GET(req: NextRequest) {
  const cityId = cityIdFrom(req);
  const ds = getDataset(cityId);
  const config = getCityConfig(cityId);
  return json({ boundary: ds.boundary, config });
}
