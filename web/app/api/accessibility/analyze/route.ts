import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { fifteenMinute } from "@/lib/gis/engine";
import { cityIdFrom, json, badRequest } from "@/lib/api";

interface AnalyzeRequest {
  points?: { lng: number; lat: number; label?: string }[];
  lng?: number;
  lat?: number;
}

/**
 * 15-minute accessibility analysis (PRD §56 `/api/accessibility/analyze`).
 *
 * Unlike the GET form at `/api/accessibility`, this accepts a batch of points so
 * a caller can compare several candidate locations in one request.
 */
export async function POST(req: NextRequest) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const points =
    body.points ??
    (Number.isFinite(body.lng) && Number.isFinite(body.lat)
      ? [{ lng: body.lng as number, lat: body.lat as number }]
      : []);
  if (!points.length) return badRequest("Provide `points: [{lng, lat}]` or `lng` and `lat`");
  if (points.length > 50) return badRequest("At most 50 points per request");

  const bad = points.find((p) => !Number.isFinite(p.lng) || !Number.isFinite(p.lat));
  if (bad) return badRequest("Every point needs finite lng and lat");

  const ds = getDataset(cityIdFrom(req));
  const results = points.map((p) => ({
    label: p.label ?? null,
    ...fifteenMinute(ds, [p.lng, p.lat]),
  }));

  return json({
    count: results.length,
    mean_score: Math.round(results.reduce((s, r) => s + r.score, 0) / results.length),
    results,
  });
}
