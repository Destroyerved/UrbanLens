import type { MapAction } from "@/types";
import { apiPost } from "@/lib/api";

/**
 * Planning copilot — answered by the Python engine (PRD §28–29).
 *
 * The backend gives an LLM exactly two jobs: choose a tool, and phrase the
 * result. Every figure comes from the GIS engine, and the structured result
 * travels alongside the prose so the UI drives the map from real values rather
 * than parsing them out of a sentence.
 *
 * If Ollama is not running the backend falls back to deterministic routing
 * through the same tools, so answers stay correct and only the wording is fixed.
 */

export interface CopilotResponse {
  text: string;
  actions: { label: string; action: MapAction }[];
  autoActions?: MapAction[];
  /** Whether an LLM phrased this, and why not when it did not. */
  llm?: { used: boolean; model?: string; reason?: string };
}

interface ApiCopilot {
  tool: string;
  answer: string;
  items?: { id?: string; label: string; sub?: string; score?: number; centroid?: [number, number] }[];
  map?: {
    highlight_parcel_ids?: string[];
    focus?: { lng: number; lat: number; zoom?: number };
    ward_metric?: string;
  };
  llm?: { used: boolean; model?: string; reason?: string };
}

/** Which app mode a tool's answer is best read in. */
const TOOL_MODE: Record<string, MapAction | undefined> = {
  site_search: { type: "setMode", mode: "sites" },
  explain_parcel: { type: "setMode", mode: "land" },
  explain_top_site: { type: "setMode", mode: "sites" },
  government_land: { type: "setMode", mode: "land" },
  infrastructure_gaps: { type: "setMode", mode: "infrastructure" },
  zoning_conflicts: { type: "setMode", mode: "land" },
  land_use_change: { type: "setMode", mode: "growth" },
};

export async function copilotQuery(q: string): Promise<CopilotResponse> {
  let res: ApiCopilot;
  try {
    res = await apiPost<ApiCopilot>("/api/copilot/query", { query: q });
  } catch (err) {
    return {
      text:
        err instanceof Error && err.message
          ? err.message
          : "The spatial engine is not reachable, so I cannot answer that right now.",
      actions: [],
    };
  }

  const autoActions: MapAction[] = [];
  const mode = TOOL_MODE[res.tool];
  if (mode) autoActions.push(mode);
  if (res.map?.focus) {
    autoActions.push({
      type: "flyTo",
      center: [res.map.focus.lng, res.map.focus.lat],
      zoom: res.map.focus.zoom ?? 13,
    });
  }
  if (res.map?.ward_metric) {
    autoActions.push({ type: "highlightWards", wardIds: (res.items ?? []).map((i) => i.id ?? "") });
  }

  // Offer the top few results as things to click, rather than firing every
  // camera move at once.
  const actions = (res.items ?? [])
    .slice(0, 4)
    .filter((i) => i.id)
    .map((i) => ({
      label: i.score !== undefined ? `${i.label} · ${i.score}` : i.label,
      action: i.centroid
        ? ({ type: "flyTo", center: i.centroid, zoom: 14 } as MapAction)
        : ({ type: "selectParcel", parcelId: i.id! } as MapAction),
    }));

  return { text: res.answer, actions, autoActions, llm: res.llm };
}
