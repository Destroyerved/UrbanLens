import type { CityDataset } from "@/lib/engine/types";
import {
  searchSites,
  infrastructureGaps,
  zoningConflicts,
  getEnriched,
  suitabilityForParcel,
  parcelIntelligence,
  WardInfra,
} from "@/lib/engine/gis/engine";
import { PROJECTS, ProjectType } from "@/lib/engine/scoring";

const fmtIntl = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * The copilot never computes spatial answers itself — it interprets intent,
 * selects a GIS tool, runs the real engine, then explains the structured result.
 * (A hosted LLM can replace the intent-parsing step without touching the tools.)
 */

export interface CopilotItem {
  id?: string;
  label: string;
  sub?: string;
  score?: number;
  centroid?: [number, number];
}

export interface CopilotMap {
  highlightParcelIds?: string[];
  focus?: { lng: number; lat: number; zoom?: number };
  layers?: ("boundary" | "wards" | "prediction" | "parcels" | "roads" | "facilities")[];
  wardMetric?: "infrastructure" | "population" | "none";
  markers?: { id: string; lng: number; lat: number; text?: string; color?: string; label?: string }[];
}

export interface CopilotResponse {
  tool: string;
  answer: string;
  items?: CopilotItem[];
  map?: CopilotMap;
}

const PROJECT_KEYWORDS: [ProjectType, RegExp][] = [
  ["hospital", /hospital|health\s?care|clinic|medical/],
  ["school", /school|education/],
  ["park", /park|green\s?space|garden/],
  ["fire_station", /fire\s?station|fire/],
  ["government_office", /gov(ernment)?\s?office|civic/],
  ["affordable_housing", /affordable|low[-\s]?cost hous/],
  ["residential", /residential|housing/],
  ["commercial", /commercial|market|retail/],
  ["industrial", /industrial|factory|warehouse/],
  ["mixed_use", /mixed[-\s]?use/],
];

function detectProject(q: string): ProjectType {
  for (const [p, re] of PROJECT_KEYWORDS) if (re.test(q)) return p;
  return "hospital";
}

type Service = keyof WardInfra["scores"];
function detectService(q: string): Service | "overall" {
  if (/hospital|health/.test(q)) return "healthcare";
  if (/school|education|colleg/.test(q)) return "education";
  if (/park|green/.test(q)) return "parks";
  if (/transport|bus|metro|transit/.test(q)) return "transportation";
  if (/road/.test(q)) return "road_connectivity";
  return "overall";
}

function firstNumber(q: string): number | null {
  const m = q.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function runCopilot(ds: CityDataset, queryRaw: string): CopilotResponse {
  const q = queryRaw.toLowerCase().trim();
  // Parcel ids are GJ-<CITY CODE>-NNNNN, so match any city's code rather than
  // only Ahmedabad's.
  const parcelIdMatch = queryRaw.match(/GJ-[A-Z]{2,4}-\d+/i);

  // --- 1. Explain a specific parcel / "why ranked" -------------------------
  if (parcelIdMatch || (/why/.test(q) && /(rank|best|site|parcel|location)/.test(q))) {
    const project = detectProject(q);
    if (parcelIdMatch) {
      const parcel = ds.parcels.features.find(
        (p) => p.properties.parcel_id.toLowerCase() === parcelIdMatch[0].toLowerCase()
      );
      if (parcel) {
        const s = suitabilityForParcel(ds, parcel, project);
        return {
          tool: "explain_parcel",
          answer: `Parcel ${s.parcel_id} scores ${s.final}/100 for a ${PROJECTS[project].label.toLowerCase()}. ${s.explanation.pros.slice(0, 3).join("; ")}.`,
          items: s.explanation.pros.map((p) => ({ label: p })).concat(s.explanation.cons.map((c) => ({ label: "⚠ " + c }))),
          map: { highlightParcelIds: [s.parcel_id], focus: { lng: s.centroid[0], lat: s.centroid[1], zoom: 14 }, layers: ["boundary", "roads", "parcels", "facilities"] },
        };
      }
    }
    // "why is this the best location" → explain the top site for the project
    const res = searchSites(ds, { project_type: project, low_flood_risk: true, limit: 1 });
    const top = res.results[0];
    if (top)
      return {
        tool: "explain_top_site",
        answer: `The top-ranked ${PROJECTS[project].label.toLowerCase()} site is ${top.parcel_id} (${top.final}/100). ${top.explanation.pros.slice(0, 3).join("; ")}.`,
        items: top.explanation.pros.map((p) => ({ label: p })),
        map: { highlightParcelIds: [top.parcel_id], focus: { lng: top.centroid[0], lat: top.centroid[1], zoom: 14 }, markers: [{ id: top.parcel_id, lng: top.centroid[0], lat: top.centroid[1], text: "1", color: "#22d3ee" }] },
      };
  }

  // --- 2. Site selection ("where should we build …", "best site for …") ----
  if (/(where|best|site|locate|build|recommend|new)/.test(q) && PROJECT_KEYWORDS.some(([, re]) => re.test(q))) {
    const project = detectProject(q);
    const spec = PROJECTS[project];
    const res = searchSites(ds, {
      project_type: project,
      government_land: /gov(ernment)?/.test(q) || spec.prefersGovernment,
      low_flood_risk: true,
      limit: 5,
    });
    const top = res.results[0];
    if (!top)
      return { tool: "site_search", answer: `No suitable parcels found for a ${spec.label.toLowerCase()} under the default constraints.` };
    return {
      tool: "site_search",
      answer: `Evaluated ${res.eligible} eligible parcels. The best site for a ${spec.label.toLowerCase()} is ${top.parcel_id} (${top.final}/100), serving ~${fmtIntl(top.pop)} residents. ${top.explanation.pros[0]}.`,
      items: res.results.map((r, i) => ({ id: r.parcel_id, label: `#${i + 1} ${r.parcel_id}`, sub: `serves ~${fmtIntl(r.pop)} · ${r.metrics.ownership}`, score: r.final, centroid: r.centroid })),
      map: {
        highlightParcelIds: res.results.map((r) => r.parcel_id),
        focus: { lng: top.centroid[0], lat: top.centroid[1], zoom: 12.5 },
        layers: ["boundary", "roads", "parcels", "facilities"],
        markers: res.results.map((r, i) => ({ id: r.parcel_id, lng: r.centroid[0], lat: r.centroid[1], text: String(i + 1), color: i === 0 ? "#22d3ee" : "#38bdf8" })),
      },
    };
  }

  // --- 3. Government / vacant land finder -----------------------------------
  if (/gov(ernment)?/.test(q) && /(land|parcel|plot|larger|vacant|hectare|acre|potential|opportunit)/.test(q)) {
    const enriched = getEnriched(ds);
    const num = firstNumber(q);
    const wantVacant = /vacant|empty|undeveloped|open/.test(q);
    const useHa = /hectare|\bha\b/.test(q);
    const minHa = num != null ? (useHa ? num : num * 0.4047) : 0;
    let list = ds.parcels.features.filter((p) => p.properties.ownership === "government");
    if (minHa) list = list.filter((p) => p.properties.area_sqm / 10_000 >= minHa);
    if (wantVacant) list = list.filter((p) => (p.properties.land_use === "vacant" || p.properties.land_use === "agriculture") && p.properties.built_up_percent < 25);
    list.sort((a, b) => (enriched.byId.get(b.properties.id)?.scores.development_potential ?? 0) - (enriched.byId.get(a.properties.id)?.scores.development_potential ?? 0));
    const top = list.slice(0, 8);
    return {
      tool: "government_land",
      answer: `Found ${list.length} government parcel${list.length === 1 ? "" : "s"}${minHa ? ` larger than ${minHa.toFixed(1)} ha` : ""}${wantVacant ? " that are vacant / developable" : ""}. Ranked by development potential below.`,
      items: top.map((p) => ({ id: p.properties.id, label: p.properties.parcel_id, sub: `${p.properties.area_acres} ac · ${p.properties.land_use}`, score: enriched.byId.get(p.properties.id)?.scores.development_potential, centroid: p.properties.centroid })),
      map: { highlightParcelIds: top.map((p) => p.properties.id), focus: top[0] ? { lng: top[0].properties.centroid[0], lat: top[0].properties.centroid[1], zoom: 12 } : undefined, layers: ["boundary", "roads", "parcels"] },
    };
  }

  // --- 4. Infrastructure gaps / underserved wards ---------------------------
  if (/(ward|underserved|infrastructure|deficit|stress|lack|poor access|access to|shortage)/.test(q)) {
    const service = detectService(q);
    const gaps = infrastructureGaps(ds);
    const sorted = service === "overall" ? gaps : [...gaps].sort((a, b) => a.scores[service] - b.scores[service]);
    const worst = sorted.slice(0, 6);
    const label = service === "overall" ? "overall infrastructure" : service.replace(/_/g, " ");
    return {
      tool: "infrastructure_gaps",
      answer: `${worst.length} wards have the weakest ${label} coverage. ${worst[0].name} is the most underserved (${service === "overall" ? worst[0].overall : worst[0].scores[service]}/100, ${fmtIntl(worst[0].population)} residents).`,
      items: worst.map((w) => ({ id: w.ward_code, label: w.name, sub: `${fmtIntl(w.population)} residents`, score: service === "overall" ? w.overall : w.scores[service], centroid: w.centroid })),
      map: { layers: ["boundary", "wards", "roads", "facilities"], wardMetric: "infrastructure", focus: { lng: worst[0].centroid[0], lat: worst[0].centroid[1], zoom: 12 } },
    };
  }

  // --- 5. Development potential / opportunity parcels ------------------------
  if (/(development potential|high.?potential|opportunit|best parcel|top parcel)/.test(q)) {
    const enriched = getEnriched(ds);
    const list = [...ds.parcels.features]
      .filter((p) => (/gov/.test(q) ? p.properties.ownership === "government" : true))
      .sort((a, b) => (enriched.byId.get(b.properties.id)?.scores.development_potential ?? 0) - (enriched.byId.get(a.properties.id)?.scores.development_potential ?? 0))
      .slice(0, 8);
    return {
      tool: "development_potential",
      answer: `The highest development-potential parcels are ranked below. ${list[0].properties.parcel_id} leads at ${enriched.byId.get(list[0].properties.id)?.scores.development_potential}/100.`,
      items: list.map((p) => ({ id: p.properties.id, label: p.properties.parcel_id, sub: `${p.properties.area_acres} ac · ${p.properties.ownership}`, score: enriched.byId.get(p.properties.id)?.scores.development_potential, centroid: p.properties.centroid })),
      map: { highlightParcelIds: list.map((p) => p.properties.id), focus: { lng: list[0].properties.centroid[0], lat: list[0].properties.centroid[1], zoom: 12 }, layers: ["boundary", "roads", "parcels"] },
    };
  }

  // --- 6. Zoning conflicts --------------------------------------------------
  if (/(zoning|violation|conflict|mismatch|encroach|illegal)/.test(q)) {
    const conflicts = zoningConflicts(ds);
    const top = conflicts.slice(0, 8);
    return {
      tool: "zoning_conflicts",
      answer: `Detected ${conflicts.length} potential zoning conflicts where actual land use diverges from the official designation. Examples below.`,
      items: top.map((c) => ({ id: c.parcel_id, label: c.parcel_id, sub: `${c.type} (official: ${c.official})`, centroid: c.centroid })),
      map: { highlightParcelIds: top.map((c) => c.parcel_id), focus: top[0] ? { lng: top[0].centroid[0], lat: top[0].centroid[1], zoom: 12 } : undefined, layers: ["boundary", "roads", "parcels"] },
    };
  }

  // --- 7. Land-use change (agri → built) ------------------------------------
  if (/(agricultur|conversion|converting|land[-\s]?use change|built[-\s]?up|urbanis|urbaniz)/.test(q)) {
    const list = ds.parcels.features
      .map((p) => ({ p, delta: (p.properties.history[2026] ?? 0) - (p.properties.history[2018] ?? 0) }))
      .filter((x) => x.delta > 25)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 8);
    return {
      tool: "land_use_change",
      answer: `${list.length ? list.length : "Several"} parcels show rapid conversion to built-up land since 2018 (top increases up to +${list[0]?.delta ?? 0} pts of built-up). These are strong signals of agricultural-to-residential transition.`,
      items: list.map((x) => ({ id: x.p.properties.id, label: x.p.properties.parcel_id, sub: `+${x.delta} pts built-up · now ${x.p.properties.land_use}`, centroid: x.p.properties.centroid })),
      map: { highlightParcelIds: list.map((x) => x.p.properties.id), focus: list[0] ? { lng: list[0].p.properties.centroid[0], lat: list[0].p.properties.centroid[1], zoom: 12 } : undefined, layers: ["boundary", "roads", "parcels"] },
    };
  }

  // --- fallback -------------------------------------------------------------
  const examplePid = ds.parcels.features[0]?.properties.parcel_id ?? "GJ-AHD-00389";
  return {
    tool: "help",
    answer:
      "I route your question to the spatial engine. Try: “Where should we build a new hospital?”, “Which wards have poor access to parks?”, “Find government land larger than 5 hectares”, “Show rapid agricultural-to-residential conversion”, or “Why is parcel " +
      examplePid +
      " a good site?”.",
  };
}
