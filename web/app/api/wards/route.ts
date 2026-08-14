import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { infrastructureGaps, livability } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

/** Ward polygons enriched with infrastructure + livability scores. */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const gaps = new Map(infrastructureGaps(ds).map((g) => [g.ward_code, g]));
  const live = new Map(livability(ds).map((l) => [l.ward_code, l]));
  const features = ds.wards.features.map((w) => {
    const g = gaps.get(w.properties.ward_code);
    const l = live.get(w.properties.ward_code);
    return {
      type: "Feature" as const,
      geometry: w.geometry,
      properties: {
        ...w.properties,
        infrastructure_score: g?.overall ?? null,
        healthcare_score: g?.scores.healthcare ?? null,
        priority: g?.priority ?? 0,
        livability_score: l?.score ?? null,
        livability_band: l?.band ?? null,
      },
    };
  });
  return json({ type: "FeatureCollection", features });
}
