import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { getEnriched } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

/**
 * Parcels as GeoJSON for the map. Each feature carries its geometry plus the
 * headline attributes and the (cached) development-potential score used for
 * choropleth styling. Query params allow lightweight filtering for map layers.
 *
 * `?detail=full` adds the enriched per-parcel measurements — proximities,
 * catchment population and factor scores. They are already computed and cached,
 * so the only cost is payload; the map omits them to stay light, while data
 * consumers that need a complete parcel record ask for them explicitly.
 */
export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  const enriched = getEnriched(ds);
  const sp = req.nextUrl.searchParams;
  const ownership = sp.get("ownership"); // "government" | "private"
  const vacant = sp.get("vacant") === "true";
  const full = sp.get("detail") === "full";

  const round2 = (n: number) => Number(n.toFixed(2));

  const features = ds.parcels.features
    .filter((p) => {
      if (ownership && p.properties.ownership !== ownership) return false;
      if (vacant && !((p.properties.land_use === "vacant" || p.properties.land_use === "agriculture") && p.properties.built_up_percent < 25)) return false;
      return true;
    })
    .map((p) => {
      const e = enriched.byId.get(p.properties.id);
      const base = {
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
        development_potential: Math.round(e?.scores.development_potential ?? 0),
        h2018: p.properties.history[2018] ?? 0,
        h2022: p.properties.history[2022] ?? 0,
        h2026: p.properties.history[2026] ?? 0,
      };
      if (!full) return { type: "Feature" as const, geometry: p.geometry, properties: base };

      return {
        type: "Feature" as const,
        geometry: p.geometry,
        properties: {
          ...base,
          survey_number: p.properties.survey_number,
          area_sqm: p.properties.area_sqm,
          vegetation_percent: p.properties.vegetation_percent,
          water_percent: p.properties.water_percent,
          elevation_m: p.properties.elevation_m,
          centroid: p.properties.centroid,
          road_km: round2(e?.roadKm ?? 0),
          hospital_km: round2(e?.nearest.hospital ?? 0),
          school_km: round2(e?.nearest.school ?? 0),
          park_km: round2(e?.nearest.park ?? 0),
          // Nearest public transport of either kind.
          transit_km: round2(Math.min(e?.nearest.bus_stop ?? Infinity, e?.nearest.metro_station ?? Infinity)),
          population_3km: e?.pop3km ?? 0,
          accessibility: Math.round(e?.scores.accessibility ?? 0),
          infrastructure_readiness: Math.round(e?.scores.infrastructure ?? 0),
          // Inverted: consumers express this as sensitivity, the engine as suitability.
          environmental_sensitivity: Math.round(100 - (e?.scores.environment ?? 0)),
        },
      };
    });

  return json({ type: "FeatureCollection", features });
}
