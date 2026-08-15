"use client";

import { create } from "zustand";
import type {
  CopilotMessage,
  GapCategory,
  LngLat,
  MapAction,
  Mode,
  ProjectType,
  SimulationResult,
  SiteCandidate,
  SiteConstraints,
  SuitabilityWeights,
  Year,
} from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";
import { MODE_PRESETS, type LayerId, type BasemapType } from "@/config/layers";
import { DEFAULT_CONSTRAINTS } from "@/lib/analysis";
import { runSiteSearch, reRankSites } from "@/services/suitability";
import { runSimulation } from "@/services/simulation";
import { copilotQuery } from "@/services/copilot";
import { PARCEL_BY_ID } from "@/data/parcels";

/**
 * Global app state (zustand — chosen over Context to keep the always-mounted
 * MapLibre canvas from re-rendering the React tree on every hover/selection).
 */

export interface FlyTarget {
  center: LngLat;
  zoom: number;
  nonce: number;
}

const SIM_STEPS = [
  "Analyzing population catchment…",
  "Evaluating current service coverage…",
  "Applying proposed intervention…",
  "Recalculating accessibility…",
];

interface AppState {
  mode: Mode;
  setMode: (m: Mode) => void;

  basemap: BasemapType;
  setBasemap: (b: BasemapType) => void;

  activeLayers: Record<string, boolean>;
  toggleLayer: (id: LayerId, on?: boolean) => void;
  layerOpacity: Record<string, number>;
  setLayerOpacity: (id: LayerId, v: number) => void;

  year: Year;
  setYear: (y: Year) => void;
  predictionOn: boolean;
  setPrediction: (on: boolean) => void;

  selectedParcelId: string | null;
  selectParcel: (id: string | null, fly?: boolean) => void;
  hoveredParcelId: string | null;
  setHovered: (id: string | null) => void;
  highlightedWardIds: string[];
  highlightWards: (ids: string[]) => void;

  gapCategory: GapCategory;
  setGapCategory: (c: GapCategory) => void;
  facilityFilter: string | null;
  setFacilityFilter: (t: string | null) => void;

  // Site selection
  siteProject: ProjectType;
  setSiteProject: (p: ProjectType) => void;
  siteConstraints: SiteConstraints;
  setSiteConstraints: (c: Partial<SiteConstraints>) => void;
  siteWeights: SuitabilityWeights;
  setSiteWeights: (w: Partial<SuitabilityWeights>) => void;
  candidates: SiteCandidate[] | null;
  analysisRunning: boolean;
  analysisError: string | null;
  runAnalysis: () => Promise<void>;

  // Simulator
  simProject: ProjectType;
  setSimProject: (p: ProjectType) => void;
  simTargetId: string | null;
  setSimTarget: (id: string | null) => void;
  simPhase: "idle" | "running" | "done";
  simStep: number;
  simResult: SimulationResult | null;
  runSim: () => Promise<void>;
  resetSim: () => void;

  // Copilot
  copilotOpen: boolean;
  setCopilotOpen: (v: boolean) => void;
  copilotMessages: CopilotMessage[];
  copilotBusy: boolean;
  sendCopilot: (text: string) => Promise<void>;

  // Search palette
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;

  /** Last empty-map click (used by the 15-minute analyzer). */
  mapClick: LngLat | null;
  setMapClick: (p: LngLat | null) => void;

  // Map
  flyTarget: FlyTarget | null;
  flyTo: (center: LngLat, zoom?: number) => void;

  applyAction: (a: MapAction) => void;
}

let flyNonce = 0;
let msgId = 0;

function layersFromPreset(mode: Mode): Record<string, boolean> {
  const on: Record<string, boolean> = {};
  for (const id of MODE_PRESETS[mode]) on[id] = true;
  return on;
}

export const useApp = create<AppState>((set, get) => ({
  mode: "overview",
  setMode: (mode) => {
    const prev = get();
    const layers = layersFromPreset(mode);
    // prediction survives into growth mode
    if (mode === "growth" && prev.predictionOn) layers["prediction"] = true;
    if (prev.candidates && (mode === "sites" || mode === "simulator"))
      layers["candidates"] = true;
    set({ mode, activeLayers: layers });
  },

  basemap: "dark",
  setBasemap: (basemap) => set({ basemap }),

  activeLayers: layersFromPreset("overview"),
  toggleLayer: (id, on) =>
    set((s) => ({
      activeLayers: {
        ...s.activeLayers,
        [id]: on !== undefined ? on : !s.activeLayers[id],
      },
      ...(id === "prediction" && on !== undefined ? { predictionOn: on } : {}),
    })),
  layerOpacity: {
    population: 0.7,
    "growth-heat": 0.75,
    "gap-heat": 0.7,
    "ndvi-heat": 0.7,
    "thermal-heat": 0.7,
    builtup: 0.5,
    prediction: 0.62,
    gap: 0.55,
  },
  setLayerOpacity: (id, v) =>
    set((s) => ({ layerOpacity: { ...s.layerOpacity, [id]: v } })),

  year: 2026,
  setYear: (year) => set({ year }),
  predictionOn: false,
  setPrediction: (on) =>
    set((s) => ({
      predictionOn: on,
      activeLayers: { ...s.activeLayers, prediction: on },
    })),

  selectedParcelId: null,
  selectParcel: (id, fly = true) => {
    set({ selectedParcelId: id });
    if (id && fly) {
      const p = PARCEL_BY_ID.get(id);
      if (p) get().flyTo(p.centroid, 13.8);
    }
  },
  hoveredParcelId: null,
  setHovered: (id) => set({ hoveredParcelId: id }),
  highlightedWardIds: [],
  highlightWards: (ids) => set({ highlightedWardIds: ids }),

  gapCategory: "healthcare",
  setGapCategory: (gapCategory) => set({ gapCategory }),
  facilityFilter: null,
  setFacilityFilter: (facilityFilter) => set({ facilityFilter }),

  siteProject: "hospital",
  setSiteProject: (siteProject) => set({ siteProject, candidates: null }),
  siteConstraints: DEFAULT_CONSTRAINTS,
  setSiteConstraints: (c) => {
    set((s) => ({ siteConstraints: { ...s.siteConstraints, ...c } }));
    const { candidates, siteProject, siteConstraints, siteWeights } = get();
    if (candidates) {
      set({ candidates: reRankSites(siteProject, siteConstraints, siteWeights) });
    }
  },
  siteWeights: DEFAULT_WEIGHTS,
  setSiteWeights: (w) => {
    set((s) => ({ siteWeights: { ...s.siteWeights, ...w } }));
    const { candidates, siteProject, siteConstraints, siteWeights } = get();
    if (candidates) {
      // Live re-rank — weight sliders update results instantly.
      set({ candidates: reRankSites(siteProject, siteConstraints, siteWeights) });
    }
  },
  candidates: null,
  analysisRunning: false,
  analysisError: null,
  runAnalysis: async () => {
    const { siteProject, siteConstraints, siteWeights } = get();
    set({ analysisRunning: true, analysisError: null, candidates: null });
    try {
      const candidates = await runSiteSearch(siteProject, siteConstraints, siteWeights);
      set((s) => ({
        candidates,
        analysisRunning: false,
        activeLayers: { ...s.activeLayers, candidates: true },
      }));
      if (candidates[0]) get().flyTo(candidates[0].parcel.centroid, 12.2);
    } catch {
      set({ analysisRunning: false, analysisError: "Analysis failed — please retry." });
    }
  },

  simProject: "hospital",
  setSimProject: (simProject) => set({ simProject, simPhase: "idle", simResult: null }),
  simTargetId: null,
  setSimTarget: (simTargetId) => set({ simTargetId, simPhase: "idle", simResult: null }),
  simPhase: "idle",
  simStep: 0,
  simResult: null,
  runSim: async () => {
    const { simTargetId, simProject } = get();
    if (!simTargetId) return;
    set({ simPhase: "running", simStep: 0, simResult: null });
    for (let i = 0; i < SIM_STEPS.length; i++) {
      set({ simStep: i });
      await new Promise((r) => setTimeout(r, 520));
    }
    const result = await runSimulation(simTargetId, simProject);
    set({ simPhase: "done", simResult: result });
  },
  resetSim: () => set({ simPhase: "idle", simResult: null, simStep: 0 }),

  copilotOpen: false,
  setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
  copilotMessages: [
    {
      id: "welcome",
      role: "assistant",
      text: "I'm the UrbanLens Copilot — a natural-language controller for the city's spatial analysis engine. Ask me where to build, what's underserved, or why a parcel ranked first.",
    },
  ],
  copilotBusy: false,
  sendCopilot: async (text) => {
    const user: CopilotMessage = { id: `m${++msgId}`, role: "user", text };
    const thinking: CopilotMessage = {
      id: `m${++msgId}`,
      role: "assistant",
      text: "",
      thinking: true,
    };
    set((s) => ({
      copilotMessages: [...s.copilotMessages, user, thinking],
      copilotBusy: true,
    }));
    try {
      const res = await copilotQuery(text);
      set((s) => ({
        copilotMessages: s.copilotMessages.map((m) =>
          m.id === thinking.id
            ? { ...m, thinking: false, text: res.text, actions: res.actions }
            : m
        ),
        copilotBusy: false,
      }));
      for (const a of res.autoActions ?? []) get().applyAction(a);
    } catch {
      set((s) => ({
        copilotMessages: s.copilotMessages.map((m) =>
          m.id === thinking.id
            ? { ...m, thinking: false, text: "Something went wrong running that analysis. Please try again." }
            : m
        ),
        copilotBusy: false,
      }));
    }
  },

  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  mapClick: null,
  setMapClick: (mapClick) => set({ mapClick }),

  flyTarget: null,
  flyTo: (center, zoom = 13.5) =>
    set({ flyTarget: { center, zoom, nonce: ++flyNonce } }),

  applyAction: (a) => {
    const s = get();
    switch (a.type) {
      case "flyTo":
        s.flyTo(a.center, a.zoom);
        break;
      case "selectParcel":
        s.selectParcel(a.parcelId, true);
        break;
      case "setMode":
        s.setMode(a.mode);
        break;
      case "enableLayer":
        s.toggleLayer(a.layerId as LayerId, true);
        break;
      case "highlightWards":
        s.highlightWards(a.wardIds);
        break;
      case "setYear":
        if (s.mode !== "growth") s.setMode("growth");
        s.setYear(a.year);
        break;
      case "enablePrediction":
        if (s.mode !== "growth") s.setMode("growth");
        s.setPrediction(true);
        break;
      case "runSiteAnalysis":
        s.setMode("sites");
        void s.runAnalysis();
        break;
    }
  },
}));
