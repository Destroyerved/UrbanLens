import type { CityDataset } from "@/lib/types";
import { getEnriched, growthSummary, infrastructureGaps, zoningConflicts } from "@/lib/gis/engine";

export interface CityOverview {
  city: string;
  provenance: "demo";
  sources: CityDataset["sources"];
  total_parcels: number;
  government_parcels: number;
  private_parcels: number;
  vacant_government_parcels: number;
  vacant_government_area_ha: number;
  built_up_area_km2: number;
  population: number;
  urban_growth_pct: number;
  high_growth_zones: number;
  infrastructure_deficit_wards: number;
  high_potential_parcels: number;
  zoning_conflicts: number;
  environmentally_sensitive_parcels: number;
}

export function cityOverview(dataset: CityDataset): CityOverview {
  const enriched = getEnriched(dataset);
  const parcels = dataset.parcels.features;

  let govt = 0;
  let vacantGovt = 0;
  let vacantGovtArea = 0;
  let highPotential = 0;
  let envSensitive = 0;
  for (const p of parcels) {
    const pr = p.properties;
    if (pr.ownership === "government") {
      govt++;
      if ((pr.land_use === "vacant" || pr.land_use === "agriculture") && pr.built_up_percent < 25) {
        vacantGovt++;
        vacantGovtArea += pr.area_sqm;
      }
    }
    if ((enriched.byId.get(pr.id)?.scores.development_potential ?? 0) >= 80) highPotential++;
    if (pr.flood_risk === "high" || pr.vegetation_percent > 75 || pr.water_percent > 15) envSensitive++;
  }

  const growth = growthSummary(dataset);
  const gaps = infrastructureGaps(dataset);
  const conflicts = zoningConflicts(dataset);
  const highGrowth = dataset.prediction.features.filter(
    (c) => c.properties.risk_category === "high" || c.properties.risk_category === "very_high"
  ).length;
  const population = dataset.wards.features.reduce((s, w) => s + w.properties.population, 0);

  return {
    city: dataset.cityId,
    provenance: "demo",
    sources: dataset.sources,
    total_parcels: parcels.length,
    government_parcels: govt,
    private_parcels: parcels.length - govt,
    vacant_government_parcels: vacantGovt,
    vacant_government_area_ha: Math.round(vacantGovtArea / 10_000),
    built_up_area_km2: growth.built_up_km2[2026],
    population,
    urban_growth_pct: growth.growth_pct_2018_2026,
    high_growth_zones: highGrowth,
    infrastructure_deficit_wards: gaps.filter((w) => w.overall < 50).length,
    high_potential_parcels: highPotential,
    zoning_conflicts: conflicts.length,
    environmentally_sensitive_parcels: envSensitive,
  };
}
