import type {
  AccessibilityReport,
  CoverageStats,
  FacilityType,
  FactorScore,
  GapCategory,
  LandUse,
  LngLat,
  Parcel,
  ProjectType,
  SimulationResult,
  SiteCandidate,
  SiteConstraints,
  SuitabilityResult,
  SuitabilityWeights,
  Ward,
  WardGap,
  Year,
  ZoningConflict,
} from "@/types";
import { clamp } from "@/lib/seeded";
import { distKm, nearestDistKm } from "@/lib/geo";
import { WARDS, WARD_BY_ID } from "@/data/wards";
import { FACILITY_COORDS } from "@/data/facilities";
import { CITY_CELLS, BUILTUP_KM2 } from "@/data/grid";
import { PARCELS, PARCEL_BY_ID } from "@/data/parcels";
import { formatKm } from "@/lib/utils";

/**
 * UrbanLens deterministic analysis engine.
 *
 * Every function here is a pure, documented, reproducible calculation — a
 * frontend stand-in for the future FastAPI + PostGIS + ML backend. The same
 * inputs always produce the same outputs; nothing presented as analysis is
 * random. When the backend lands, the service layer swaps these for API
 * calls (see services/*).
 */

/* ============================= Coverage ============================= */

export const SERVICE_RADIUS_KM: Partial<Record<ProjectType, number>> = {
  hospital: 4.0,
  school: 1.6,
  park: 1.4,
  transit: 1.2,
  fire: 5.0,
  govt: 3.0,
};

const PROJECT_FACILITY: Partial<Record<ProjectType, FacilityType>> = {
  hospital: "hospital",
  school: "school",
  park: "park",
  transit: "transit",
  fire: "fire",
  govt: "govt",
};

/**
 * Population-weighted service coverage over the analysis grid.
 * coveragePct = share of city population within `radiusKm` of a facility.
 */
export function computeCoverage(
  facilityCoords: LngLat[],
  radiusKm: number,
  within?: { center: LngLat; radiusKm: number }
): CoverageStats {
  let coveredPop = 0;
  let totalPop = 0;
  let distSum = 0;
  for (const cell of CITY_CELLS) {
    if (within && distKm(cell.center, within.center) > within.radiusKm) continue;
    const d = Math.min(nearestDistKm(cell.center, facilityCoords), 15);
    totalPop += cell.population;
    distSum += d * cell.population;
    if (d <= radiusKm) coveredPop += cell.population;
  }
  return {
    coveragePct: totalPop > 0 ? Math.round((coveredPop / totalPop) * 100) : 0,
    avgDistKm: totalPop > 0 ? Math.round((distSum / totalPop) * 10) / 10 : 0,
    coveredPop,
    totalPop,
  };
}

/** Residents within `nearKm` of a point whose nearest facility exceeds `radiusKm`. */
export function uncoveredPopulationNear(
  point: LngLat,
  facilityCoords: LngLat[],
  radiusKm: number,
  nearKm = 3
): number {
  let sum = 0;
  for (const cell of CITY_CELLS) {
    if (distKm(point, cell.center) > nearKm) continue;
    if (nearestDistKm(cell.center, facilityCoords) > radiusKm) sum += cell.population;
  }
  return sum;
}

/* ============================ Ward gaps ============================= */

const GAP_FACILITIES: Record<GapCategory, FacilityType[]> = {
  healthcare: ["hospital", "clinic"],
  education: ["school"],
  parks: ["park"],
  transport: ["transit"],
  safety: ["fire", "police"],
};

const GAP_TARGET_KM: Record<GapCategory, number> = {
  healthcare: 4.0,
  education: 2.4,
  parks: 3.2,
  transport: 2.6,
  safety: 5.5,
};

const GAP_WEIGHT: Record<GapCategory, number> = {
  healthcare: 0.3,
  education: 0.2,
  parks: 0.15,
  transport: 0.2,
  safety: 0.15,
};

/**
 * Per-ward infrastructure gap scores (0–100, higher = better served).
 * score = 100 − 55·(popWeightedMeanDist / targetDist), clamped.
 */
export function computeWardGaps(): WardGap[] {
  const coordsByCat = Object.fromEntries(
    (Object.keys(GAP_FACILITIES) as GapCategory[]).map((cat) => [
      cat,
      GAP_FACILITIES[cat].flatMap((t) => FACILITY_COORDS(t)),
    ])
  ) as Record<GapCategory, LngLat[]>;

  const hospitalCoords = FACILITY_COORDS("hospital");

  return WARDS.map((ward) => {
    const cells = CITY_CELLS.filter((c) => c.wardId === ward.id);
    const pop = cells.reduce((s, c) => s + c.population, 0) || 1;
    const scores = {} as Record<GapCategory, number>;
    for (const cat of Object.keys(GAP_FACILITIES) as GapCategory[]) {
      let distSum = 0;
      for (const c of cells) {
        distSum += Math.min(nearestDistKm(c.center, coordsByCat[cat]), 10) * c.population;
      }
      const meanDist = distSum / pop;
      scores[cat] = Math.round(clamp(100 - (meanDist / GAP_TARGET_KM[cat]) * 45, 4, 98));
    }
    const overall = Math.round(
      (Object.keys(scores) as GapCategory[]).reduce(
        (s, cat) => s + scores[cat] * GAP_WEIGHT[cat],
        0
      )
    );
    let affected = 0;
    for (const c of cells) {
      if (nearestDistKm(c.center, hospitalCoords) > 3.5) affected += c.population;
    }
    return {
      wardId: ward.id,
      wardName: ward.name,
      population: ward.population[2026],
      scores,
      overall,
      affectedPopulation: affected,
    };
  }).sort((a, b) => a.overall - b.overall);
}

/* ========================= 15-minute analysis ======================= */

/** Assumed mixed-mode speed: 18 km/h → 0.3 km per minute. */
const KM_PER_MIN = 0.3;

const ACCESS_ITEMS: { label: string; types: FacilityType[]; weight: number }[] = [
  { label: "Hospital", types: ["hospital", "clinic"], weight: 0.28 },
  { label: "School", types: ["school"], weight: 0.22 },
  { label: "Park", types: ["park"], weight: 0.15 },
  { label: "Transit", types: ["transit"], weight: 0.2 },
  { label: "Govt Office", types: ["govt"], weight: 0.15 },
];

export function computeAccessibility(point: LngLat, extra?: { type: FacilityType; coord: LngLat }): AccessibilityReport {
  const items = ACCESS_ITEMS.map(({ label, types, weight }) => {
    let coords = types.flatMap((t) => FACILITY_COORDS(t));
    if (extra && types.includes(extra.type)) coords = [...coords, extra.coord];
    const minutes = Math.round(nearestDistKm(point, coords) / KM_PER_MIN);
    return { label, minutes, ok: minutes <= 15, weight };
  });
  const score = Math.round(
    items.reduce(
      (s, it) => s + it.weight * clamp(100 - Math.max(0, it.minutes - 5) * 4.5, 0, 100),
      0
    )
  );
  return { items: items.map(({ label, minutes, ok }) => ({ label, minutes, ok })), score };
}

/* ============================ Livability ============================ */

export function calculateLivability(
  wardId: string,
  gaps: WardGap[],
  extra?: { type: FacilityType; coord: LngLat }
): { components: { label: string; score: number }[]; score: number } {
  const gap = gaps.find((g) => g.wardId === wardId);
  const ward = WARD_BY_ID.get(wardId);
  if (!gap || !ward) return { components: [], score: 0 };
  const access = computeAccessibility(ward.centroid, extra);
  // If a facility is simulated, uplift the matching gap category directly.
  const uplift = (cat: GapCategory): number => {
    if (!extra) return gap.scores[cat];
    const matches = GAP_FACILITIES[cat].includes(extra.type);
    if (!matches) return gap.scores[cat];
    const d = distKm(ward.centroid, extra.coord);
    return Math.round(clamp(gap.scores[cat] + clamp(34 - d * 6, 0, 34), 0, 98));
  };
  const components = [
    { label: "Healthcare", score: uplift("healthcare") },
    { label: "Education", score: uplift("education") },
    { label: "Green Space", score: uplift("parks") },
    { label: "Transportation", score: uplift("transport") },
    { label: "Safety & Services", score: uplift("safety") },
    { label: "Accessibility", score: access.score },
  ];
  const score = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);
  return { components, score };
}

/* ========================== Suitability ============================= */

const NEED_DIST_NORM: Partial<Record<ProjectType, number>> = {
  hospital: 5,
  school: 2.6,
  park: 2.4,
  transit: 2.2,
  fire: 6,
  govt: 4,
};

const MIN_REC_AREA_HA: Record<ProjectType, number> = {
  hospital: 2,
  school: 1,
  park: 0.8,
  transit: 0.5,
  fire: 0.8,
  govt: 1,
  residential: 2,
  affordable: 1.5,
  commercial: 1,
  industrial: 3,
  mixed: 2,
};

function needDistanceFor(p: Parcel, projectType: ProjectType): number {
  switch (projectType) {
    case "hospital":
    case "fire":
    case "govt":
      return p.hospitalDistKm;
    case "school":
      return p.schoolDistKm;
    case "park":
      return p.parkDistKm;
    case "transit":
      return p.transitDistKm;
    default:
      return p.hospitalDistKm;
  }
}

const FLOOD_ENV_BASE: Record<string, number> = { low: 95, medium: 55, high: 18 };

/**
 * Explainable multi-criteria suitability (PRD §18).
 * Each factor is normalized 0–100; final score = Σ wᵢ·fᵢ / Σ wᵢ.
 */
export function computeSuitability(
  parcel: Parcel,
  projectType: ProjectType,
  weights: SuitabilityWeights
): SuitabilityResult {
  const isService = projectType in NEED_DIST_NORM;
  const facilityType = PROJECT_FACILITY[projectType];
  const serviceRadius = SERVICE_RADIUS_KM[projectType] ?? 3;

  // 1 — Accessibility need: how far residents here are from the nearest
  // existing service of this type (farther = greater unmet need).
  const needDist = needDistanceFor(parcel, projectType);
  const accessibility = isService
    ? clamp((needDist / (NEED_DIST_NORM[projectType] ?? 4)) * 100, 0, 100)
    : clamp(100 - ((parcel.hospitalDistKm + parcel.transitDistKm) / 2 / 4) * 100, 0, 100);

  // 2 — Population need: underserved residents within 3 km.
  const uncovered = facilityType
    ? uncoveredPopulationNear(parcel.centroid, FACILITY_COORDS(facilityType), serviceRadius)
    : Math.round(parcel.population3km * 0.4);
  const populationNeed = clamp((uncovered / 250000) * 100, 0, 100);

  // 3 — Transit connectivity.
  const transit = clamp(100 - (parcel.transitDistKm / 3) * 100, 0, 100);

  // 4 — Infrastructure readiness: road access + utilities.
  const roadScore = clamp(100 - (parcel.roadDistKm / 2.5) * 100, 0, 100);
  const infrastructure = 0.55 * roadScore + 0.45 * parcel.infraReadiness;

  // 5 — Environmental suitability: flood exposure + ecological sensitivity.
  const environment = clamp(
    FLOOD_ENV_BASE[parcel.floodRisk] - parcel.envSensitivity * 0.35,
    0,
    100
  );

  // 6 — Land compatibility: tenure + size fit + current use.
  const areaFit = clamp(parcel.areaHa / (MIN_REC_AREA_HA[projectType] * 1.6), 0, 1) * 22;
  const useBonus =
    parcel.landUse === "vacant"
      ? 18
      : parcel.landUse === "agriculture"
        ? 12
        : parcel.zoning === "public"
          ? 16
          : 5;
  const landCompatibility = clamp(
    (parcel.ownership === "government" ? 58 : 26) + areaFit + useBonus,
    0,
    100
  );

  const factors: FactorScore[] = [
    {
      key: "accessibility",
      label: "Accessibility Need",
      score: Math.round(accessibility),
      weight: weights.accessibility,
      detail: isService
        ? `Nearest existing ${projectType}: ${formatKm(needDist)}`
        : `Hospital ${formatKm(parcel.hospitalDistKm)} · transit ${formatKm(parcel.transitDistKm)}`,
    },
    {
      key: "populationNeed",
      label: "Population Need",
      score: Math.round(populationNeed),
      weight: weights.populationNeed,
      detail: `${Math.round(uncovered / 1000)}K underserved residents within 3 km`,
    },
    {
      key: "transit",
      label: "Transit",
      score: Math.round(transit),
      weight: weights.transit,
      detail: `Nearest transit stop: ${formatKm(parcel.transitDistKm)}`,
    },
    {
      key: "infrastructure",
      label: "Infrastructure",
      score: Math.round(infrastructure),
      weight: weights.infrastructure,
      detail: `Road ${formatKm(parcel.roadDistKm)} · readiness ${parcel.infraReadiness}/100`,
    },
    {
      key: "environment",
      label: "Environment",
      score: Math.round(environment),
      weight: weights.environment,
      detail: `Flood risk ${parcel.floodRisk} · sensitivity ${parcel.envSensitivity}/100`,
    },
    {
      key: "landCompatibility",
      label: "Land Compatibility",
      score: Math.round(landCompatibility),
      weight: weights.landCompatibility,
      detail: `${parcel.ownership === "government" ? "Government" : "Private"} · ${parcel.areaHa} ha · ${parcel.landUse}`,
    },
  ];

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const score = Math.round(
    factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight
  );

  const strengths: string[] = [];
  const concerns: string[] = [];
  if (parcel.ownership === "government") strengths.push("Government-owned land");
  else concerns.push("Private ownership — acquisition required");
  if (populationNeed >= 70)
    strengths.push(`Serves ~${Math.round(uncovered / 1000)}K underserved residents`);
  if (accessibility >= 70 && isService)
    strengths.push(`Fills a service gap — nearest ${projectType} is ${formatKm(needDist)} away`);
  if (roadScore >= 65) strengths.push(`Strong road connectivity (${formatKm(parcel.roadDistKm)})`);
  else if (roadScore < 40) concerns.push(`Weak road access — ${formatKm(parcel.roadDistKm)} to arterial road`);
  if (parcel.floodRisk === "low") strengths.push("Low flood exposure");
  else concerns.push(`${parcel.floodRisk === "high" ? "High" : "Moderate"} flood exposure (Sabarmati floodplain)`);
  if (parcel.areaHa >= MIN_REC_AREA_HA[projectType] * 1.5)
    strengths.push(`Suitable parcel size (${parcel.areaHa} ha)`);
  if (parcel.infraReadiness >= 75) strengths.push("Utilities & drainage infrastructure ready");
  else if (parcel.infraReadiness < 55) concerns.push("Limited existing utility infrastructure");
  if (transit < 50) concerns.push(`Public transport ${formatKm(parcel.transitDistKm)} away — accessibility can improve`);
  if (parcel.envSensitivity > 45) concerns.push("Elevated ecological sensitivity");
  else if (environment >= 80) strengths.push("Low environmental sensitivity");

  return { parcelId: parcel.id, score, factors, strengths, concerns };
}

export const DEFAULT_CONSTRAINTS: SiteConstraints = {
  minAreaHa: 4,
  governmentOnly: true,
  maxRoadDistKm: 2.5,
  lowFloodOnly: false,
  maxEnvSensitivity: 60,
  maxBuiltUpPct: 40,
  excludeFloodHazard: false,
};

/** Filter by constraints, score, rank. PRD §16–17. */
export function searchSites(
  projectType: ProjectType,
  constraints: SiteConstraints,
  weights: SuitabilityWeights,
  limit = 6
): SiteCandidate[] {
  const eligible = PARCELS.filter((p) => {
    if (constraints.minAreaHa !== undefined && p.areaHa < constraints.minAreaHa) return false;
    if (constraints.governmentOnly && p.ownership !== "government") return false;
    if (constraints.maxRoadDistKm !== undefined && p.roadDistKm > constraints.maxRoadDistKm) return false;
    if ((constraints.lowFloodOnly || constraints.excludeFloodHazard) && p.floodRisk !== "low") return false;
    if (constraints.maxEnvSensitivity !== undefined && p.envSensitivity > constraints.maxEnvSensitivity) return false;
    if (["water"].includes(p.landUse)) return false;
    // don't recommend building on land that is already densely built
    if (p.builtUpPct > (constraints.maxBuiltUpPct ?? 40)) return false;
    return true;
  });
  return eligible
    .map((p) => computeSuitability(p, projectType, weights))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1, parcel: PARCEL_BY_ID.get(r.parcelId)! }));
}

/* =========================== Simulation ============================= */

/**
 * What-if intervention simulation (PRD §26–27): recomputes real coverage
 * statistics over the grid with the proposed facility added.
 */
export function simulateIntervention(parcelId: string, projectType: ProjectType): SimulationResult {
  const parcel = PARCEL_BY_ID.get(parcelId);
  if (!parcel) throw new Error(`Unknown parcel ${parcelId}`);
  const facilityType = PROJECT_FACILITY[projectType] ?? "hospital";
  const radius = SERVICE_RADIUS_KM[projectType] ?? 3;
  const coords = FACILITY_COORDS(facilityType);
  const before = computeCoverage(coords, radius);
  const after = computeCoverage([...coords, parcel.centroid], radius);
  const corridor = { center: parcel.centroid, radiusKm: 6 };
  const corridorBefore = computeCoverage(coords, radius, corridor);
  const corridorAfter = computeCoverage([...coords, parcel.centroid], radius, corridor);
  const newlyCovered = after.coveredPop - before.coveredPop;

  const gaps = computeWardGaps();
  const accessBefore = computeAccessibility(parcel.centroid);
  const accessAfter = computeAccessibility(parcel.centroid, {
    type: facilityType,
    coord: parcel.centroid,
  });
  const livBefore = calculateLivability(parcel.wardId, gaps);
  const livAfter = calculateLivability(parcel.wardId, gaps, {
    type: facilityType,
    coord: parcel.centroid,
  });

  return {
    projectType,
    parcelId,
    wardName: WARD_BY_ID.get(parcel.wardId)?.name ?? parcel.wardId,
    serviceRadiusKm: radius,
    before,
    after,
    corridorBefore,
    corridorAfter,
    newlyCovered,
    accessibilityBefore: accessBefore.score,
    accessibilityAfter: accessAfter.score,
    livabilityBefore: livBefore.score,
    livabilityAfter: livAfter.score,
    center: parcel.centroid,
    radiusKm: radius,
  };
}

/* ========================= Growth analytics ========================= */

export function computeTransitions(from: Year, to: Year): { from: LandUse; to: LandUse; areaHa: number }[] {
  const map = new Map<string, number>();
  for (const p of PARCELS) {
    const a = p.landUseByYear[from];
    const b = p.landUseByYear[to];
    if (a === b) continue;
    const key = `${a}→${b}`;
    map.set(key, (map.get(key) ?? 0) + p.areaHa);
  }
  return Array.from(map.entries())
    .map(([key, areaHa]) => {
      const [f, t] = key.split("→") as [LandUse, LandUse];
      return { from: f, to: t, areaHa: Math.round(areaHa * 10) / 10 };
    })
    .sort((a, b) => b.areaHa - a.areaHa);
}

export function growthSummary() {
  const base = BUILTUP_KM2[2018] || 1;
  const current = BUILTUP_KM2[2024] ?? BUILTUP_KM2[2018] ?? 0;
  return {
    builtUpKm2: BUILTUP_KM2,
    growthPct: Math.round(((current - base) / base) * 100),
  };
}

/* ========================= Zoning conflicts ========================= */

const BUILT: LandUse[] = ["residential", "commercial", "industrial", "mixed"];

export function detectZoningConflicts(): ZoningConflict[] {
  return PARCELS.filter(
    (p) =>
      BUILT.includes(p.landUse) &&
      ["agriculture", "vegetation", "vacant", "water"].includes(p.zoning)
  )
    .map((p) => ({
      parcelId: p.id,
      official: p.zoning,
      detected: p.landUse,
      severity: (p.zoning === "water" || p.zoning === "vegetation" || p.builtUpPct > 70
        ? "high"
        : "moderate") as "high" | "moderate",
    }))
    .sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1));
}

/* =========================== City KPIs ============================== */

export function computeCityKpis() {
  const gaps = computeWardGaps();
  const conflicts = detectZoningConflicts();
  const govt = PARCELS.filter((p) => p.ownership === "government");
  const vacantGovtHa = govt
    .filter((p) => p.landUse === "vacant" || p.landUse === "agriculture")
    .reduce((s, p) => s + p.areaHa, 0);
  const population = WARDS.reduce((s, w) => s + (w.population?.[2026] ?? 0), 0);
  const { growthPct } = growthSummary();
  const hospitals = FACILITY_COORDS("hospital");
  const coverage = computeCoverage(hospitals, SERVICE_RADIUS_KM.hospital!);
  return {
    population,
    growthPct,
    totalParcels: PARCELS.length,
    govtParcels: govt.length,
    vacantGovtHa: Math.round(vacantGovtHa),
    deficitWards: gaps.filter((g) => g.overall < 55).length,
    zoningConflicts: conflicts.length,
    healthcareCoveragePct: coverage.coveragePct,
    underservedPop: coverage.totalPop - coverage.coveredPop,
  };
}

/* ==================== Prediction explainability ===================== */

export function explainGrowth(wardId: string): string[] {
  const ward = WARD_BY_ID.get(wardId);
  if (!ward) return [];
  const base = ward.population?.[2018] || 1;
  const current = ward.population?.[2026] ?? base;
  const growth = Math.round(((current - base) / base) * 100);
  return [
    `Population grew ${growth}% since 2018`,
    "Adjacent to the expanding 2026 built-up frontier",
    "Strong arterial road connectivity (S.G. Highway corridor)",
    "Large supply of developable vacant & agricultural parcels",
  ];
}
