import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { infrastructureGaps } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  return json({ wards: infrastructureGaps(ds) });
}
