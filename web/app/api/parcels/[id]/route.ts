import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { parcelIntelligence } from "@/lib/gis/engine";
import { cityIdFrom, json, notFound } from "@/lib/api";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/parcels/[id]">) {
  const { id } = await ctx.params;
  const ds = getDataset(cityIdFrom(req));
  const parcel = ds.parcels.features.find(
    (p) => p.properties.id === id || p.properties.parcel_id === id
  );
  if (!parcel) return notFound(`Parcel ${id} not found`);
  return json({ ...parcelIntelligence(ds, parcel), geometry: parcel.geometry });
}
