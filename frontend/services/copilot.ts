import type { MapAction, ProjectType } from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";
import {
  computeSuitability,
  computeWardGaps,
  computeTransitions,
  detectZoningConflicts,
  growthSummary,
  searchSites,
  simulateIntervention,
  DEFAULT_CONSTRAINTS,
  SERVICE_RADIUS_KM,
} from "@/lib/analysis";
import { PARCEL_BY_ID, PARCELS } from "@/data/parcels";
import { WARD_BY_ID, WARDS } from "@/data/wards";
import { formatCompact, formatKm } from "@/lib/utils";
import { simulateLatency } from "./latency";

/**
 * AI Copilot service — deterministic tool layer.
 *
 * Architecture rule (PRD §29): the LLM never invents spatial answers. Until
 * the backend LLM+tool pipeline exists, this module plays the "LLM + tools"
 * role: it interprets intent with pattern matching, calls the SAME
 * deterministic analysis engine the rest of the app uses, and phrases the
 * structured result. Backend swap: POST /api/copilot/query.
 */

export interface CopilotResponse {
  text: string;
  actions: { label: string; action: MapAction }[];
  autoActions?: MapAction[];
}

const PROJECT_WORDS: [RegExp, ProjectType][] = [
  [/hospital|health|clinic|medical/i, "hospital"],
  [/school|education/i, "school"],
  [/park|green/i, "park"],
  [/fire/i, "fire"],
  [/transit|metro|bus|brts/i, "transit"],
];

export async function copilotQuery(q: string): Promise<CopilotResponse> {
  await simulateLatency(650);
  const query = q.toLowerCase();

  // --- Parcel deep-dive: "why did GJ-AHD-1028 rank first" / any parcel id
  const idMatch = q.match(/GJ-AHD-\d{4}/i);
  if (idMatch) {
    const parcel = PARCEL_BY_ID.get(idMatch[0].toUpperCase());
    if (!parcel) {
      return {
        text: `I couldn't find parcel ${idMatch[0].toUpperCase()} in the GLIS registry. Try the global search (⌘K) to browse parcel IDs.`,
        actions: [],
      };
    }
    const s = computeSuitability(parcel, "hospital", DEFAULT_WEIGHTS);
    const ward = WARD_BY_ID.get(parcel.wardId);
    const top = [...s.factors].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3);
    return {
      text:
        `**${parcel.id}** — ${ward?.name}, ${parcel.areaHa} ha, ${parcel.ownership}-owned ${parcel.landUse} land.\n\n` +
        `Hospital-suitability score: **${s.score}/100**. The strongest drivers:\n` +
        top.map((f) => `• ${f.label}: ${f.score}/100 — ${f.detail}`).join("\n") +
        (s.concerns.length ? `\n\nTrade-offs the model flags:\n${s.concerns.map((c) => `⚠ ${c}`).join("\n")}` : ""),
      actions: [
        { label: "Show on map", action: { type: "selectParcel", parcelId: parcel.id } },
      ],
      autoActions: [{ type: "flyTo", center: parcel.centroid, zoom: 13.6 }],
    };
  }

  // --- Site selection: "where should Ahmedabad build a hospital?"
  if (/where|best|build|site|recommend|locate/.test(query)) {
    const project = PROJECT_WORDS.find(([re]) => re.test(query))?.[1];
    if (project) {
      const candidates = searchSites(project, DEFAULT_CONSTRAINTS, DEFAULT_WEIGHTS, 3);
      if (candidates.length === 0) {
        return {
          text: "No parcels satisfy the default constraints. Try relaxing the minimum area or ownership filters in Site Selection.",
          actions: [{ label: "Open Site Selection", action: { type: "setMode", mode: "sites" } }],
        };
      }
      const top = candidates[0];
      const ward = WARD_BY_ID.get(top.parcel.wardId);
      return {
        text:
          `I evaluated ${PARCELS.length} GLIS parcels against accessibility need, population need, transit, infrastructure, environment and land compatibility.\n\n` +
          `**Top sites for a new ${project}:**\n` +
          candidates
            .map((c) => `#${c.rank} **${c.parcelId}** — ${c.score}/100 (${WARD_BY_ID.get(c.parcel.wardId)?.name})`)
            .join("\n") +
          `\n\n${top.parcelId} leads because: ${top.strengths.slice(0, 3).join("; ").toLowerCase()}.` +
          ` It sits in ${ward?.name}, the corridor with the city's fastest growth and weakest ${project} coverage.`,
        actions: [
          { label: `Fly to ${top.parcelId}`, action: { type: "selectParcel", parcelId: top.parcelId } },
          { label: "Open full analysis", action: { type: "runSiteAnalysis" } },
        ],
        autoActions: [{ type: "flyTo", center: top.parcel.centroid, zoom: 13 }],
      };
    }
  }

  // --- Underserved areas / infrastructure gaps
  if (/underserved|gap|deficit|poor.*(access|coverage)|lack|stress/.test(query)) {
    const gaps = computeWardGaps();
    const is2030 = /2030|future|predict/.test(query);
    const parkFocus = /park|green/.test(query);
    const worst = [...gaps]
      .sort((a, b) =>
        parkFocus ? a.scores.parks - b.scores.parks : a.overall - b.overall
      )
      .slice(0, 3);
    const label = parkFocus ? "park access" : "overall infrastructure";
    return {
      text:
        `${is2030 ? "Cross-referencing 2030 growth probability with today's service coverage, these" : "These"} wards rank worst on ${label}:\n\n` +
        worst
          .map(
            (g) =>
              `• **${g.wardName}** — ${parkFocus ? `parks ${g.scores.parks}` : `score ${g.overall}`}/100, ${formatCompact(g.affectedPopulation)} residents beyond 3.5 km of a hospital`
          )
          .join("\n") +
        `\n\nThe NW corridor (Gota–Chandkheda) combines rapid growth with the thinnest coverage — that's where intervention buys the most impact.`,
      actions: [
        { label: "Highlight on map", action: { type: "highlightWards", wardIds: worst.map((w) => w.wardId) } },
        { label: "Open Infrastructure", action: { type: "setMode", mode: "infrastructure" } },
      ],
      autoActions: [
        { type: "setMode", mode: "infrastructure" },
        { type: "highlightWards", wardIds: worst.map((w) => w.wardId) },
      ],
    };
  }

  // --- Government land opportunities
  if (/government land|govt land|opportunit|vacant land|public land/.test(query)) {
    const opps = searchSites(
      "mixed",
      { ...DEFAULT_CONSTRAINTS, minAreaHa: 1, governmentOnly: true },
      DEFAULT_WEIGHTS,
      4
    );
    return {
      text:
        `Filtering GLIS for government tenure + low built-up + low environmental risk + good accessibility, the strongest opportunity parcels are:\n\n` +
        opps
          .map(
            (o) =>
              `• **${o.parcelId}** — opportunity ${o.score}/100, ${o.parcel.areaHa} ha, ${WARD_BY_ID.get(o.parcel.wardId)?.name}`
          )
          .join("\n"),
      actions: [
        { label: "Open Land Intelligence", action: { type: "setMode", mode: "land" } },
        ...(opps[0]
          ? [{ label: `Inspect ${opps[0].parcelId}`, action: { type: "selectParcel", parcelId: opps[0].parcelId } as MapAction }]
          : []),
      ],
      autoActions: [{ type: "setMode", mode: "land" }],
    };
  }

  // --- Growth / prediction / conversion
  if (/agricultur|conversion|convert|transition/.test(query)) {
    const t = computeTransitions(2018, 2026).filter((x) => x.from === "agriculture");
    const total = t.reduce((s, x) => s + x.areaHa, 0);
    return {
      text:
        `Between 2018 and 2026, **${Math.round(total)} ha** of agricultural land converted to other uses:\n\n` +
        t.slice(0, 4).map((x) => `• Agriculture → ${x.to}: ${x.areaHa} ha`).join("\n") +
        `\n\nConversion concentrates along the S.G. Highway corridor (Gota, Bopal) and the eastern industrial belt.`,
      actions: [{ label: "Open Urban Growth", action: { type: "setMode", mode: "growth" } }],
      autoActions: [{ type: "setMode", mode: "growth" }, { type: "setYear", year: 2026 }],
    };
  }

  if (/2030|grow|expand|sprawl|predict/.test(query)) {
    const { builtUpKm2, growthPct } = growthSummary();
    const fastest = [...WARDS]
      .map((w) => ({
        w,
        g: (w.population[2026] - w.population[2018]) / w.population[2018],
      }))
      .sort((a, b) => b.g - a.g)
      .slice(0, 3);
    return {
      text:
        `Built-up area grew from **${builtUpKm2[2018]} km²** (2018) to **${builtUpKm2[2026]} km²** (2026) — +${growthPct}%.\n\n` +
        `The 2030 model puts the highest growth probability just beyond the current NW frontier. Fastest-growing wards:\n` +
        fastest.map(({ w, g }) => `• ${w.name}: +${Math.round(g * 100)}% population since 2018`).join("\n"),
      actions: [
        { label: "Show 2030 prediction", action: { type: "enablePrediction" } },
      ],
      autoActions: [{ type: "setMode", mode: "growth" }, { type: "enablePrediction" }],
    };
  }

  // --- Zoning conflicts
  if (/zoning|conflict|violation|mismatch|encroach/.test(query)) {
    const conflicts = detectZoningConflicts();
    const high = conflicts.filter((c) => c.severity === "high");
    return {
      text:
        `Comparing official GLIS designation against detected land use, I found **${conflicts.length} potential zoning conflicts** (${high.length} high-severity).\n\n` +
        conflicts
          .slice(0, 3)
          .map((c) => `• ${c.parcelId}: official ${c.official} → detected ${c.detected}`)
          .join("\n") +
        `\n\nThese are advisory flags — each needs verification against the official land record.`,
      actions: [{ label: "Open Land Intelligence", action: { type: "setMode", mode: "land" } }],
      autoActions: [{ type: "setMode", mode: "land" }],
    };
  }

  // --- Simulation ask
  if (/simulat|what.?if|impact/.test(query)) {
    const project = PROJECT_WORDS.find(([re]) => re.test(query))?.[1] ?? "hospital";
    const top = searchSites(project, DEFAULT_CONSTRAINTS, DEFAULT_WEIGHTS, 1)[0];
    if (top) {
      const sim = simulateIntervention(top.parcelId, project);
      return {
        text:
          `Simulating a ${project} at **${top.parcelId}** (service radius ${SERVICE_RADIUS_KM[project] ?? 3} km):\n\n` +
          `• Coverage: ${sim.before.coveragePct}% → **${sim.after.coveragePct}%**\n` +
          `• Residents newly covered: **+${formatCompact(sim.newlyCovered)}**\n` +
          `• Avg distance to ${project}: ${sim.before.avgDistKm} km → **${sim.after.avgDistKm} km**`,
        actions: [
          { label: "Open Simulator", action: { type: "setMode", mode: "simulator" } },
          { label: `Fly to ${top.parcelId}`, action: { type: "selectParcel", parcelId: top.parcelId } },
        ],
      };
    }
  }

  // --- Fallback
  return {
    text:
      `I can run real spatial analysis on the Ahmedabad demo dataset. Try:\n\n` +
      `• "Where should Ahmedabad build a new hospital?"\n` +
      `• "Show underserved areas near government land"\n` +
      `• "Which wards face infrastructure stress by 2030?"\n` +
      `• "Show agricultural-to-residential conversion"\n` +
      `• "Why did GJ-AHD-1028 rank first?"\n` +
      `• "Simulate a hospital"`,
    actions: [],
  };
}
