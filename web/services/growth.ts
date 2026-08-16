import type { LandUse, Year } from "@/types";
import { apiGet } from "@/lib/api";
import { PARCELS } from "@/data/parcels";

/**
 * Urban growth — summarised by the Python engine (PRD §9, §12).
 *
 * The built-up series, corridors and explanation come from the engine.
 * Transitions stay client-side: they are a pivot over the parcel layer already
 * loaded, not an analysis, so a request would buy nothing.
 */

export async function fetchGrowthSummary(): Promise<{
  builtUpKm2: Record<Year, number>;
  growthPct: number;
}> {
  const res = await apiGet<{
    built_up_km2: Record<string, number>;
    growth_pct_2018_2026: number;
  }>("/api/growth");
  return {
    builtUpKm2: {
      2018: res.built_up_km2["2018"],
      2022: res.built_up_km2["2022"],
      2026: res.built_up_km2["2026"],
    } as Record<Year, number>,
    growthPct: res.growth_pct_2018_2026,
  };
}

export interface Corridor {
  name: string;
  risk: string;
  historicalGrowthPts: number;
  predictedGrowthPct: number;
  population: number;
}

export async function fetchCorridors(): Promise<Corridor[]> {
  const res = await apiGet<{
    corridors: {
      name: string;
      risk: string;
      historical_growth_pts: number;
      predicted_growth_pct: number;
      population: number;
    }[];
  }>("/api/growth");
  return res.corridors.map((c) => ({
    name: c.name,
    risk: c.risk,
    historicalGrowthPts: c.historical_growth_pts,
    predictedGrowthPct: c.predicted_growth_pct,
    population: c.population,
  }));
}

export async function fetchTransitions(
  from: Year,
  to: Year,
): Promise<{ from: LandUse; to: LandUse; areaHa: number }[]> {
  const tally = new Map<string, number>();
  for (const p of PARCELS) {
    const a = p.landUseByYear?.[from];
    const b = p.landUseByYear?.[to];
    if (!a || !b || a === b) continue;
    const k = `${a}>${b}`;
    tally.set(k, (tally.get(k) ?? 0) + p.areaHa);
  }
  return Array.from(tally.entries())
    .map(([k, areaHa]) => {
      const [f, t] = k.split(">") as [LandUse, LandUse];
      return { from: f, to: t, areaHa: Math.round(areaHa * 10) / 10 };
    })
    .sort((x, y) => y.areaHa - x.areaHa);
}

export async function fetchGrowthExplanation(wardId: string): Promise<string[]> {
  const [growth, gaps] = await Promise.all([
    apiGet<{
      growth_pct_2018_2026: number;
      parcels_urbanising: number;
      corridors: { name: string; risk: string; predicted_growth_pct: number }[];
    }>("/api/growth"),
    apiGet<{ wards: { ward_code: string; name: string; population: number }[] }>(
      "/api/infrastructure/gaps",
    ),
  ]);
  const ward = gaps.wards.find((w) => w.ward_code === wardId);
  const top = [...growth.corridors].sort(
    (a, b) => b.predicted_growth_pct - a.predicted_growth_pct,
  )[0];

  const lines = [
    `Built-up area grew ${growth.growth_pct_2018_2026}% across the city between 2018 and 2026.`,
    `${growth.parcels_urbanising.toLocaleString("en-IN")} parcels show rapid conversion to built-up land.`,
  ];
  if (top) {
    lines.push(
      `${top.name} carries the strongest signal at ${top.predicted_growth_pct}% modelled development pressure (${top.risk.toLowerCase()} risk).`,
    );
  }
  if (ward) {
    lines.push(`${ward.name} holds ${ward.population.toLocaleString("en-IN")} residents.`);
  }
  // Say it plainly wherever growth is quoted.
  lines.push("Built-up history is modelled, not observed from satellite imagery.");
  return lines;
}
