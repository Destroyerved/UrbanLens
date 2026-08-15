import { NextRequest } from "next/server";
import { getDataset } from "@/lib/engine/data/store";
import { infrastructureGaps, livability, fifteenMinute } from "@/lib/engine/gis/engine";
import { cityIdFrom, json, notFound } from "@/lib/engine/api";

/**
 * Full profile for a single ward (PRD §56 `/api/wards/{id}`): boundary,
 * demographics, infrastructure gap scores, livability breakdown, a 15-minute
 * accessibility reading at its centroid, and a summary of the parcels in it.
 *
 * Accepts either the ward code (AMC-01) or the ward name, case-insensitively.
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const ds = getDataset(cityIdFrom(req));
  const key = decodeURIComponent(id).toLowerCase();

  const ward = ds.wards.features.find(
    (w) =>
      w.properties.ward_code.toLowerCase() === key ||
      w.properties.name.toLowerCase() === key
  );
  if (!ward) return notFound(`No ward matching "${id}"`);

  const code = ward.properties.ward_code;
  const gap = infrastructureGaps(ds).find((g) => g.ward_code === code);
  const live = livability(ds).find((l) => l.ward_code === code);

  // Parcel mix inside the ward — what land the planner actually has to work with.
  let government = 0;
  let vacantGovernment = 0;
  let vacantGovernmentArea = 0;
  let builtUpSum = 0;
  const parcels = ds.parcels.features.filter((p) => p.properties.ward === code);
  for (const p of parcels) {
    const pr = p.properties;
    builtUpSum += pr.built_up_percent;
    if (pr.ownership !== "government") continue;
    government++;
    if ((pr.land_use === "vacant" || pr.land_use === "agriculture") && pr.built_up_percent < 25) {
      vacantGovernment++;
      vacantGovernmentArea += pr.area_sqm;
    }
  }

  return json({
    ward_code: code,
    name: ward.properties.name,
    district: ward.properties.district,
    population: ward.properties.population,
    population_density: ward.properties.population_density,
    area_sqm: ward.properties.area_sqm,
    centroid: ward.properties.centroid,
    // Real measured attributes, present when the ward layer is official.
    road_length_km: ward.properties.road_length_km ?? null,
    road_density: ward.properties.road_density ?? null,
    compactness: ward.properties.compactness ?? null,
    perimeter_km: ward.properties.perimeter_km ?? null,
    infrastructure: gap ? { overall: gap.overall, priority: gap.priority, scores: gap.scores } : null,
    livability: live ? { score: live.score, band: live.band, components: live.components } : null,
    fifteen_minute: fifteenMinute(ds, ward.properties.centroid),
    parcels: {
      total: parcels.length,
      government,
      private: parcels.length - government,
      vacant_government: vacantGovernment,
      vacant_government_area_ha: Math.round(vacantGovernmentArea / 10_000),
      mean_built_up_percent: parcels.length ? Math.round(builtUpSum / parcels.length) : 0,
    },
    geometry: ward.geometry,
  });
}
