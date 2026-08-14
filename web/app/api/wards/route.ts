import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { infrastructureGaps } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

/** Ward polygons enriched with infrastructure + livability scores. */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const gaps = new Map(infrastructureGaps(ds).map((g) => [g.ward_code, g]));
  const features = ds.wards.features.map((w) => {
    const g = gaps.get(w.properties.ward_code);
    return {
      type: "Feature" as const,
      geometry: w.geometry,
      properties: {
        ...w.properties,
        infrastructure_score: g?.overall ?? null,
        healthcare_score: g?.scores.healthcare ?? null,
        priority: g?.priority ?? 0,
      },
    };
  });
  return json({ type: "FeatureCollection", features });
}
