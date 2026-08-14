import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { runCopilot } from "@/lib/gis/copilot";
import { cityIdFrom, json, badRequest } from "@/lib/api";

export async function POST(req: NextRequest) {
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.query || !body.query.trim()) return badRequest("query is required");
  const ds = getDataset(cityIdFrom(req));
  return json(runCopilot(ds, body.query));
}
