import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { cityIdFrom, json } from "@/lib/api";
import type { FacilityType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const typesParam = req.nextUrl.searchParams.get("types");
  const types = typesParam ? new Set(typesParam.split(",") as FacilityType[]) : null;
  const features = types
    ? ds.facilities.features.filter((f) => types.has(f.properties.facility_type))
    : ds.facilities.features;
  return json({ type: "FeatureCollection", features });
}
