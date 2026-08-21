"use client";

import { create } from "zustand";
import { DEFAULT_CONSTRAINTS, YEARS } from "@/types";
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
import { runSiteSearch, reRankSites } from "@/services/suitability";
import { runSimulation } from "@/services/simulation";
import { copilotQuery } from "@/services/copilot";
import { PARCEL_BY_ID, setParcels } from "@/data/parcels";
import { setWards } from "@/data/wards";
import { setRoads } from "@/data/roads";
import { setFacilities } from "@/data/facilities";
import { setGrid } from "@/data/grid";
import { setVegetation } from "@/data/vegetation";
import { setGreenspace } from "@/data/greenspace";
import { fetchCityDataset, fetchOptionalCityLayers } from "@/lib/dataset";
import { setApiCity, warmEngine } from "@/lib/api";
import { cityById, DEFAULT_CITY, type CityConfig } from "@/config/city";
import { getMapInstance } from "@/lib/mapref";
import { m2 } from "@/lib/marks";

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
  /** Active study area. Every API call carries its id. */
  city: CityConfig;
  /**
   * Bumped whenever the map layers are swapped. The layer modules are ES live
   * bindings, so importers see new data immediately — but React has no way to
   * know that, so components that read PARCELS/WARDS/... subscribe to this to
   * know when to re-derive.
   */
  datasetVersion: number;
  cityLoading: boolean;
  cityError: string | null;
  setCity: (id: string) => Promise<void>;

  mode: Mode;
  setMode: (m: Mode) => void;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  togglePanel: () => void;

  searchFocused: boolean;
  setSearchFocused: (v: boolean) => void;

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
  compareOpen: boolean;
  setCompareOpen: (v: boolean) => void;
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

  // Search palette & Dock
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  searchFocused: boolean;
  setSearchFocused: (v: boolean) => void;
  citySwitcherOpen: boolean;
  setCitySwitcherOpen: (v: boolean) => void;

  /** Last empty-map click (used by the 15-minute analyzer). */
  mapClick: LngLat | null;
  /** Routed corridor alignment, drawn on the map while the panel is open. */
  corridorPath: LngLat[] | null;
  setCorridorPath: (path: LngLat[] | null) => void;
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

function getInitialBasemap(): BasemapType {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("urbanlens_basemap") as BasemapType | null;
      if (saved && ["satellite", "hybrid", "streets", "terrain", "dark", "light"].includes(saved)) {
        return saved;
      }
    } catch {}
  }
  return "terrain";
}

export const useApp = create<AppState>((set, get) => ({
  mode: "overview",
  panelOpen: true,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  searchFocused: false,
  setSearchFocused: (searchFocused) => set({ searchFocused }),

  setMode: (mode) => {
    const prev = get();
    const layers = layersFromPreset(mode);
    // prediction survives into growth mode
    if (mode === "growth" && prev.predictionOn) layers["prediction"] = true;
    if (prev.candidates && (mode === "sites" || mode === "simulator"))
      layers["candidates"] = true;
    
    // If clicking current active mode, toggle panel open/closed; if switching mode, ensure panel is open
    const panelOpen = prev.mode === mode ? !prev.panelOpen : true;
    set({ mode, activeLayers: layers, panelOpen });
  },

  basemap: getInitialBasemap(),
  setBasemap: (basemap) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("urbanlens_basemap", basemap);
      } catch {}
    }
    set({ basemap });
  },

  activeLayers: layersFromPreset("overview"),
  toggleLayer: (id, on) => {
    const current = get();
    const nextOn = on !== undefined ? on : !current.activeLayers[id];
    set((s) => ({
      activeLayers: { ...s.activeLayers, [id]: nextOn },
      ...(id === "prediction" ? { predictionOn: nextOn } : {}),
    }));

    // Vegetation/greenspace are visually optional and used to block the whole
    // city load. Fetch them only when somebody actually turns them on.
    if (nextOn && (id === "ndvi-heat" || id === "greenspace")) {
      const cityId = get().city.id;
      void fetchOptionalCityLayers(cityId).then((layers) => {
        if (get().city.id !== cityId) return;
        setVegetation(layers.vegetation);
        setGreenspace(layers.greenspace);
        const map = getMapInstance();
        const vegetation = map?.getSource("vegetation") as { setData: (d: unknown) => void } | undefined;
        const greenspace = map?.getSource("greenspace") as { setData: (d: unknown) => void } | undefined;
        vegetation?.setData(layers.vegetation);
        greenspace?.setData(layers.greenspace);
      }).catch(() => {
        // Optional visual layers never make the core dashboard unavailable.
      });
    }
  },
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

  // The Time Machine only displays observed Esri epochs. Keep its initial
  // selection on the latest observation so the built-up layer is visible as
  // soon as Growth mode opens.
  year: 2024,
  // 2026 remains a domain type for current parcel/population attributes, but
  // it is not an Esri observation epoch. Never let a Time Machine action pick
  // an epoch for which the observed built-up source does not exist.
  setYear: (year) => set({ year: YEARS.includes(year) ? year : 2024 }),
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

  city: DEFAULT_CITY,
  datasetVersion: 0,
  cityLoading: false,
  cityError: null,
  setCity: async (id) => {
    m2("store:start");
    const city = cityById(id);
    if (get().city.id === city.id && get().datasetVersion > 0) return;
    setApiCity(city.id);
    // Anything derived from the previous area is now about the wrong place.
    set({
      city,
      cityLoading: true,
      cityError: null,
      candidates: null,
      simResult: null,
      selectedParcelId: null,
      highlightedWardIds: [],
    });
    try {
      const d = await fetchCityDataset(city.id);
      m2("store:fetched");
      // Wards first: facilities resolve their ward against them.
      setWards(d.wards);
      setParcels(d.parcels);
      setRoads(d.roads);
      setFacilities(d.facilities);
      setGrid(d.grid);
      setVegetation(d.vegetation);
      setGreenspace(d.greenspace);
      set((st) => ({ datasetVersion: st.datasetVersion + 1, cityLoading: false }));
      m2("store:done");
      // The core dashboard is served from the static/CDN bootstrap. Wake a
      // sleeping free-tier Python service only after the UI is interactive so
      // later site-search/simulation actions do not pay as much cold-start cost.
      if (typeof window !== "undefined") {
        window.setTimeout(() => warmEngine(), 350);
      }
    } catch (err) {
      set({
        cityLoading: false,
        cityError:
          err instanceof Error ? err.message : `Could not load ${city.name}.`,
      });
    }
  },

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
  compareOpen: false,
  setCompareOpen: (compareOpen) => set({ compareOpen }),
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
    // Start the real computation immediately. The old UI waited 2.08 seconds
    // before even sending the request just to play progress copy. Keep a short
    // progress animation, but overlap it with the backend call.
    const resultPromise = runSimulation(simTargetId, simProject);
    for (let i = 0; i < SIM_STEPS.length; i++) {
      set({ simStep: i });
      await new Promise((r) => setTimeout(r, 90));
    }
    const result = await resultPromise;
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
  searchFocused: false,
  setSearchFocused: (searchFocused) => set({ searchFocused }),
  citySwitcherOpen: false,
  setCitySwitcherOpen: (citySwitcherOpen) => set({ citySwitcherOpen }),

  mapClick: null,
  setMapClick: (mapClick) => set({ mapClick }),
  corridorPath: null,
  setCorridorPath: (corridorPath) => set({ corridorPath }),

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
