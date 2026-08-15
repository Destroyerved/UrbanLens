import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { cityIdFrom, json } from "@/lib/engine/api";

/** 2030 urban-growth probability grid (explainable logistic model). */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  return json(ds.prediction);
}
