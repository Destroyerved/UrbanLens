import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { searchSites, SiteSearchRequest } from "@/lib/engine/gis/engine";
import { PROJECTS } from "@/lib/engine/scoring";
import { cityIdFrom, json, badRequest } from "@/lib/engine/api";

export async function POST(req: NextRequest) {
  let body: SiteSearchRequest;
  try {
    body = (await req.json()) as SiteSearchRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.project_type || !PROJECTS[body.project_type]) {
    return badRequest("project_type is required and must be a known project");
  }
  const ds = getDataset(cityIdFrom(req));
  const result = searchSites(ds, body);
  return json({ project: PROJECTS[body.project_type].label, ...result });
}
