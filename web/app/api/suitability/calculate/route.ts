import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { suitabilityForParcel } from "@/lib/engine/gis/engine";
import { PROJECTS, DEFAULT_WEIGHTS, ProjectType, Weights } from "@/lib/engine/scoring";
import { cityIdFrom, json, badRequest, notFound } from "@/lib/engine/api";

interface CalculateRequest {
  parcel_id: string;
  project_type: ProjectType;
  weights?: Partial<Weights>;
}

/**
 * Scores one named parcel for one project type (PRD §56
 * `/api/suitability/calculate`), as opposed to `/search`, which ranks the whole
 * city. Weights are optional and merged over the defaults, so a caller can vary
 * a single priority without restating the rest.
 */
export async function POST(req: NextRequest) {
  let body: CalculateRequest;
  try {
    body = (await req.json()) as CalculateRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.parcel_id) return badRequest("parcel_id is required");
  if (!body.project_type || !PROJECTS[body.project_type]) {
    return badRequest("project_type is required and must be a known project");
  }

  const ds = getDataset(cityIdFrom(req));
  const key = String(body.parcel_id).toLowerCase();
  const parcel = ds.parcels.features.find(
    (p) => p.properties.parcel_id.toLowerCase() === key || p.properties.id.toLowerCase() === key
  );
  if (!parcel) return notFound(`No parcel matching "${body.parcel_id}"`);

  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(body.weights ?? {}) };
  const result = suitabilityForParcel(ds, parcel, body.project_type, weights);

  return json({
    project: PROJECTS[body.project_type].label,
    weights,
    ...result,
  });
}
