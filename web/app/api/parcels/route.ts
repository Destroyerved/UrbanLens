import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { getEnriched } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

/**
 * Parcels as GeoJSON for the map. Each feature carries its geometry plus the
 * headline attributes and the (cached) development-potential score used for
 * choropleth styling. Query params allow lightweight filtering for map layers.
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const enriched = getEnriched(ds);
  const sp = req.nextUrl.searchParams;
  const ownership = sp.get("ownership"); // "government" | "private"
  const vacant = sp.get("vacant") === "true";

  const features = ds.parcels.features
    .filter((p) => {
      if (ownership && p.properties.ownership !== ownership) return false;
      if (vacant && !((p.properties.land_use === "vacant" || p.properties.land_use === "agriculture") && p.properties.built_up_percent < 25)) return false;
      return true;
    })
    .map((p) => ({
      type: "Feature" as const,
      geometry: p.geometry,
      properties: {
        id: p.properties.id,
        parcel_id: p.properties.parcel_id,
        ownership: p.properties.ownership,
        land_use: p.properties.land_use,
        zoning: p.properties.zoning,
        area_acres: p.properties.area_acres,
        built_up_percent: p.properties.built_up_percent,
        flood_risk: p.properties.flood_risk,
        ward: p.properties.ward,
        source: p.properties.source ?? "synthetic",
        name: p.properties.name ?? null,
        development_potential: Math.round(enriched.byId.get(p.properties.id)?.scores.development_potential ?? 0),
        h2018: p.properties.history[2018] ?? 0,
        h2022: p.properties.history[2022] ?? 0,
        h2026: p.properties.history[2026] ?? 0,
      },
    }));

  return json({ type: "FeatureCollection", features });
}
