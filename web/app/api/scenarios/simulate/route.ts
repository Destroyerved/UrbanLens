import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { simulate, SimulateRequest } from "@/lib/gis/engine";
import { PROJECTS } from "@/lib/scoring";
import { cityIdFrom, json, badRequest } from "@/lib/api";

export async function POST(req: NextRequest) {
  let body: SimulateRequest;
  try {
    body = (await req.json()) as SimulateRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.project_type || !PROJECTS[body.project_type]) {
    return badRequest("project_type is required and must be a known project");
  }
  if (typeof body.lng !== "number" || typeof body.lat !== "number") {
    return badRequest("lng and lat are required");
  }
  const ds = getDataset(cityIdFrom(req));
  return json(simulate(ds, body));
}
