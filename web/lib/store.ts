"use client";

import { create } from "zustand";
import { DEFAULT_CONSTRAINTS } from "@/types";
import type {
  CopilotMessage,
  GapCategory,
  LngLat,
  MapAction,
  Mode,
  Parcel,
  ProjectType,
  SimulationResult,
  SiteCandidate,
  SiteConstraints,
  SuitabilityWeights,
  Year,
} from "@/types";
import type { FeatureCollection } from "geojson";
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
import { setWater } from "@/data/water";
import { setFlood } from "@/data/flood";
import { fetchBaseDataset, fetchParcels, fetchVegetation, fetchGreenspace, fetchWater, fetchFlood, type LazyLayer } from "@/lib/dataset";
import { setApiCity } from "@/lib/api";
import { cityById, DEFAULT_CITY, type CityConfig } from "@/config/city";

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
  /**
   * Which lazy layers (parcels, vegetation, greenspace) are loaded for the
   * current study area. Empty on every city switch; `ensureLayer` fills it on
   * demand, so heavy layers cost nothing until something asks for them.
   */
  lazyLoaded: Partial<Record<LazyLayer, boolean>>;
  lazyLoading: Partial<Record<LazyLayer, boolean>>;
  lazyError: string | null;
  ensureLayer: (layer: LazyLayer) => Promise<void>;
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

function getInitialBasemap(): BasemapType {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("urbanlens_basemap") as BasemapType | null;
      if (saved && ["satellite", "hybrid", "streets", "terrain", "dark", "light"].includes(saved)) {
        return saved;
      }
    } catch {}
  }
  return "hybrid";
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
    // Parcels-first modes need the heavy parcel layer loaded to be useful.
    if (layers["parcels"]) void get().ensureLayer("parcels");
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
    const next = on !== undefined ? on : !get().activeLayers[id];
    set((s) => ({
      activeLayers: {
        ...s.activeLayers,
        [id]: next,
      },
      ...(id === "prediction" && on !== undefined ? { predictionOn: on } : {}),
    }));
    if (next) {
      if (id === "parcels") void get().ensureLayer("parcels");
      else if (id === "ndvi-heat") void get().ensureLayer("vegetation");
      else if (id === "greenspace") void get().ensureLayer("greenspace");
      else if (id === "water") void get().ensureLayer("water");
      else if (id === "flood-risk") void get().ensureLayer("flood");
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

  city: DEFAULT_CITY,
  datasetVersion: 0,
  cityLoading: false,
  cityError: null,
  lazyLoaded: {},
  lazyLoading: {},
  lazyError: null,
  setCity: async (id) => {
    const city = cityById(id);
    if (get().city.id === city.id && get().datasetVersion > 0) return;
    setApiCity(city.id);
    // Anything derived from the previous area is now about the wrong place.
    set({
      city,
      cityLoading: true,
      cityError: null,
      lazyLoaded: {},
      lazyLoading: {},
      lazyError: null,
      candidates: null,
      simResult: null,
      selectedParcelId: null,
      highlightedWardIds: [],
    });
    try {
      const d = await fetchBaseDataset(city.id);
      // Wards first: facilities resolve their ward against them.
      setWards(d.wards);
      setRoads(d.roads);
      setFacilities(d.facilities);
      setGrid(d.grid);
      // Lazy layers reset to empty — the previous city's parcels/vegetation are
      // gone until ensureLayer refetches them for this one.
      setParcels([]);
      setVegetation({ type: "FeatureCollection", features: [] });
      setGreenspace({ type: "FeatureCollection", features: [] });
      setWater({ type: "FeatureCollection", features: [] });
      setFlood({ type: "FeatureCollection", features: [] });
      set((st) => ({ datasetVersion: st.datasetVersion + 1, cityLoading: false }));
    } catch (err) {
      set({
        cityLoading: false,
        cityError:
          err instanceof Error ? err.message : `Could not load ${city.name}.`,
      });
    }
  },
  ensureLayer: async (layer) => {
    const { city, lazyLoaded, lazyLoading } = get();
    if (lazyLoaded[layer] || lazyLoading[layer]) return;
    set((s) => ({ lazyLoading: { ...s.lazyLoading, [layer]: true }, lazyError: null }));
    try {
      const data =
        layer === "parcels"
          ? await fetchParcels(city.id)
          : layer === "vegetation"
            ? await fetchVegetation(city.id)
            : layer === "greenspace"
              ? await fetchGreenspace(city.id)
              : layer === "water"
                ? await fetchWater(city.id)
                : await fetchFlood(city.id);
      // The study area may have changed while this was in flight.
      if (get().city.id !== city.id) return;
      if (layer === "parcels") setParcels(data as Parcel[]);
      else if (layer === "vegetation") setVegetation(data as FeatureCollection);
      else if (layer === "greenspace") setGreenspace(data as FeatureCollection);
      else if (layer === "water") setWater(data as FeatureCollection);
      else setFlood(data as FeatureCollection);
      set((s) => ({
        lazyLoading: { ...s.lazyLoading, [layer]: false },
        lazyLoaded: { ...s.lazyLoaded, [layer]: true },
        datasetVersion: s.datasetVersion + 1,
      }));
    } catch (err) {
      if (get().city.id !== city.id) return;
      set((s) => ({
        lazyLoading: { ...s.lazyLoading, [layer]: false },
        lazyError: err instanceof Error ? err.message : `Could not load ${layer}.`,
      }));
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
  analysisRunning: false,
  analysisError: null,
  runAnalysis: async () => {
    const { siteProject, siteConstraints, siteWeights } = get();
    set({ analysisRunning: true, analysisError: null, candidates: null });
    // The candidate search works over parcels — make sure they're loaded.
    await get().ensureLayer("parcels");
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
    // Simulation runs on parcels — make sure they're loaded.
    await get().ensureLayer("parcels");
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
        // Ensure parcels are loaded so PARCEL_BY_ID can resolve the target.
        void get().ensureLayer("parcels");
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