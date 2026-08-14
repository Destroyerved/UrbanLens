import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { fifteenMinute } from "@/lib/gis/engine";
import { cityIdFrom, json, badRequest } from "@/lib/api";

/** 15-minute-city accessibility for a point. GET ?lng=&lat=. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lng = Number(sp.get("lng"));
  const lat = Number(sp.get("lat"));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return badRequest("lng and lat query params required");
  const ds = getDataset(cityIdFrom(req));
  return json(fifteenMinute(ds, [lng, lat]));
}
