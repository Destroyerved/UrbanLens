import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { zoningConflicts } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const conflicts = zoningConflicts(ds);
  return json({ count: conflicts.length, conflicts });
}
