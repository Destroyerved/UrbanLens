"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useTheme } from "next-themes";
import { ACTIVE_CITY } from "@/config/city";
import { useApp } from "@/lib/store";
import { PARCEL_BY_ID } from "@/data/parcels";
import {
  parcelsFC,
  wardsFC,
  roadsFC,
  facilitiesFC,
  builtupFC,
  predictionFC,
  populationFC,
  gapFC,
  growthHeatFC,
  gapHeatFC,
  ndviHeatFC,
  thermalHeatFC,
  landUseColorExpr,
  FACILITY_COLORS,
  FACILITY_LABELS,
} from "@/lib/mapdata";
import { circleRing } from "@/lib/geo";
import { setMapInstance } from "@/lib/mapref";
import type { Year } from "@/types";

const YEARS: Year[] = [2018, 2022, 2026];

const CARTO_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

function rasterTiles(style: "dark_all" | "light_all"): string[] {
  return ["a", "b", "c", "d"].map(
    (s) => `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`
  );
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const simMarkerRef = useRef<Marker | null>(null);
  const rafRef = useRef<number>(0);

  const { resolvedTheme } = useTheme();
  const basemap = useApp((s) => s.basemap);
  const mode = useApp((s) => s.mode);
  const activeLayers = useApp((s) => s.activeLayers);
  const layerOpacity = useApp((s) => s.layerOpacity);
  const year = useApp((s) => s.year);
  const selectedParcelId = useApp((s) => s.selectedParcelId);
  const highlightedWardIds = useApp((s) => s.highlightedWardIds);
  const facilityFilter = useApp((s) => s.facilityFilter);
  const candidates = useApp((s) => s.candidates);
  const simResult = useApp((s) => s.simResult);
  const simPhase = useApp((s) => s.simPhase);
  const flyTarget = useApp((s) => s.flyTarget);
  const selectParcel = useApp((s) => s.selectParcel);
  const setHovered = useApp((s) => s.setHovered);
  const setMapClick = useApp((s) => s.setMapClick);

  /* ------------------------------ init ------------------------------ */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: rasterTiles("dark_all"),
            tileSize: 256,
            attribution: CARTO_ATTRIB,
          },
          "carto-light": {
            type: "raster",
            tiles: rasterTiles("light_all"),
            tileSize: 256,
            attribution: CARTO_ATTRIB,
          },
          "esri-satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles &copy; Esri &mdash; Satellite Imagery",
          },
          "esri-topo": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles &copy; Esri &mdash; Topographic",
          },
          "carto-voyager": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: CARTO_ATTRIB,
          },
          "esri-labels": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Labels &copy; Esri",
          },
        },
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": "#0b0e14" },
          },
          { id: "basemap-dark", type: "raster", source: "carto-dark" },
          { id: "basemap-light", type: "raster", source: "carto-light", layout: { visibility: "none" } },
          { id: "basemap-satellite", type: "raster", source: "esri-satellite", layout: { visibility: "none" } },
          { id: "basemap-terrain", type: "raster", source: "esri-topo", layout: { visibility: "none" } },
          { id: "basemap-streets", type: "raster", source: "carto-voyager", layout: { visibility: "none" } },
          { id: "basemap-hybrid-labels", type: "raster", source: "esri-labels", layout: { visibility: "none" } },
        ],
      },
      center: ACTIVE_CITY.center,
      zoom: ACTIVE_CITY.zoom,
      minZoom: 9.5,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    setMapInstance(map);

    map.on("load", () => {
      /* ---- sources ---- */
      map.addSource("parcels", {
        type: "geojson",
        data: parcelsFC,
        promoteId: "id",
      });
      map.addSource("wards", { type: "geojson", data: wardsFC, promoteId: "id" });
      map.addSource("roads", { type: "geojson", data: roadsFC });
      map.addSource("facilities", { type: "geojson", data: facilitiesFC });
      for (const y of YEARS)
        map.addSource(`builtup-${y}`, { type: "geojson", data: builtupFC(y) });
      map.addSource("prediction", { type: "geojson", data: predictionFC });
      map.addSource("population", { type: "geojson", data: populationFC });
      map.addSource("growth-heat", { type: "geojson", data: growthHeatFC });
      map.addSource("gap-heat", { type: "geojson", data: gapHeatFC });
      map.addSource("ndvi-heat", { type: "geojson", data: ndviHeatFC });
      map.addSource("thermal-heat", { type: "geojson", data: thermalHeatFC });
      map.addSource("gap", { type: "geojson", data: gapFC });
      map.addSource("sim-coverage", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      /* ---- intelligence surfaces (under vectors) ---- */
      for (const y of YEARS) {
        map.addLayer({
          id: `builtup-${y}`,
          type: "fill",
          source: `builtup-${y}`,
          paint: { "fill-color": "#d97706", "fill-opacity": 0 },
          layout: { visibility: "none" },
        });
        map.setPaintProperty(`builtup-${y}`, "fill-opacity-transition", {
          duration: 650,
        } as never);
      }
      map.addLayer({
        id: "prediction",
        type: "fill",
        source: "prediction",
        paint: {
          "fill-color": [
            "step",
            ["get", "p"],
            "#64748b",
            0.2,
            "#fbbf24",
            0.4,
            "#fb923c",
            0.6,
            "#f87171",
            0.8,
            "#dc2626",
          ] as never,
          "fill-opacity": 0,
        },
        layout: { visibility: "none" },
      });
      map.setPaintProperty("prediction", "fill-opacity-transition", {
        duration: 500,
      } as never);
      map.addLayer({
        id: "gap",
        type: "fill",
        source: "gap",
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["get", "pop"],
            1500,
            0.08,
            20000,
            0.55,
          ] as never,
        },
        layout: { visibility: "none" },
      });

      /* ---- HEATMAP LAYERS ---- */
      // 1. Population Density Heatmap
      map.addLayer({
        id: "population",
        type: "heatmap",
        source: "population",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "pop"],
            0,
            0,
            30000,
            1,
          ] as never,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            20,
            14,
            52,
          ] as never,
          "heatmap-intensity": 1,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(56,189,248,0)",
            0.25,
            "rgba(56,189,248,0.45)",
            0.5,
            "rgba(250,204,21,0.65)",
            0.75,
            "rgba(249,115,22,0.8)",
            1,
            "rgba(220,38,38,0.9)",
          ] as never,
        },
        layout: { visibility: "none" },
      });

      // 2. Growth Pressure Heatmap
      map.addLayer({
        id: "growth-heat",
        type: "heatmap",
        source: "growth-heat",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            1,
            1,
          ] as never,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            24,
            14,
            58,
          ] as never,
          "heatmap-intensity": 1.15,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(168,85,247,0)",
            0.25,
            "rgba(168,85,247,0.45)",
            0.5,
            "rgba(249,115,22,0.7)",
            0.75,
            "rgba(239,68,68,0.85)",
            1,
            "rgba(255,255,255,0.95)",
          ] as never,
        },
        layout: { visibility: "none" },
      });

      // 3. Healthcare Gap Deficit Heatmap
      map.addLayer({
        id: "gap-heat",
        type: "heatmap",
        source: "gap-heat",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            50,
            1,
          ] as never,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            22,
            14,
            54,
          ] as never,
          "heatmap-intensity": 1,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(239,68,68,0)",
            0.3,
            "rgba(249,115,22,0.5)",
            0.6,
            "rgba(220,38,38,0.75)",
            1,
            "rgba(153,27,27,0.92)",
          ] as never,
        },
        layout: { visibility: "none" },
      });

      // 4. Vegetation / NDVI Canopy Heatmap
      map.addLayer({
        id: "ndvi-heat",
        type: "heatmap",
        source: "ndvi-heat",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            1,
            1,
          ] as never,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            22,
            14,
            54,
          ] as never,
          "heatmap-intensity": 0.95,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(34,197,94,0)",
            0.3,
            "rgba(132,204,22,0.5)",
            0.6,
            "rgba(34,197,94,0.75)",
            1,
            "rgba(21,128,61,0.92)",
          ] as never,
        },
        layout: { visibility: "none" },
      });

      // 5. Urban Heat Island (UHI) Heatmap
      map.addLayer({
        id: "thermal-heat",
        type: "heatmap",
        source: "thermal-heat",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            1,
            1,
          ] as never,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            24,
            14,
            58,
          ] as never,
          "heatmap-intensity": 1,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(59,130,246,0)",
            0.3,
            "rgba(234,179,8,0.5)",
            0.6,
            "rgba(249,115,22,0.75)",
            1,
            "rgba(185,28,28,0.94)",
          ] as never,
        },
        layout: { visibility: "none" },
      });

      /* ---- sim coverage ring ---- */
      map.addLayer({
        id: "sim-coverage-fill",
        type: "fill",
        source: "sim-coverage",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.16 },
      });
      map.addLayer({
        id: "sim-coverage-line",
        type: "line",
        source: "sim-coverage",
        paint: { "line-color": "#3b82f6", "line-width": 2, "line-opacity": 0.8 },
      });

      /* ---- wards ---- */
      map.addLayer({
        id: "wards-fill",
        type: "fill",
        source: "wards",
        paint: { "fill-color": "#94a3b8", "fill-opacity": 0.02 },
      });
      map.addLayer({
        id: "wards-line",
        type: "line",
        source: "wards",
        paint: {
          "line-color": "#94a3b8",
          "line-opacity": 0.35,
          "line-width": 1,
          "line-dasharray": [3, 2] as never,
        },
      });
      map.addLayer({
        id: "ward-highlight",
        type: "fill",
        source: "wards",
        filter: ["in", ["get", "id"], ["literal", []]] as never,
        paint: { "fill-color": "#22d3ee", "fill-opacity": 0.14 },
      });
      map.addLayer({
        id: "ward-highlight-line",
        type: "line",
        source: "wards",
        filter: ["in", ["get", "id"], ["literal", []]] as never,
        paint: { "line-color": "#22d3ee", "line-width": 2, "line-opacity": 0.9 },
      });

      /* ---- parcels ---- */
      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        paint: {
          "fill-color": landUseColorExpr("use2026") as never,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.75,
            0.48,
          ] as never,
        },
      });
      map.addLayer({
        id: "parcels-line",
        type: "line",
        source: "parcels",
        paint: {
          "line-color": landUseColorExpr("use2026") as never,
          "line-opacity": 0.85,
          "line-width": 1.1,
        },
      });
      map.addLayer({
        id: "govt-land",
        type: "line",
        source: "parcels",
        filter: ["==", ["get", "government"], true] as never,
        paint: { "line-color": "#3b82f6", "line-width": 1.8, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "zoning-conflicts",
        type: "line",
        source: "parcels",
        filter: ["==", ["get", "conflict"], true] as never,
        paint: {
          "line-color": "#ef4444",
          "line-width": 2.2,
          "line-dasharray": [2, 1.4] as never,
        },
      });

      /* ---- candidates + selection ---- */
      map.addLayer({
        id: "candidates-fill",
        type: "fill",
        source: "parcels",
        filter: ["in", ["get", "id"], ["literal", []]] as never,
        paint: { "fill-color": "#22d3ee", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "candidates-line",
        type: "line",
        source: "parcels",
        filter: ["in", ["get", "id"], ["literal", []]] as never,
        paint: { "line-color": "#22d3ee", "line-width": 2 },
      });
      map.addLayer({
        id: "selected-glow",
        type: "line",
        source: "parcels",
        filter: ["==", ["get", "id"], ""] as never,
        paint: { "line-color": "#22d3ee", "line-width": 10, "line-opacity": 0.25, "line-blur": 4 },
      });
      map.addLayer({
        id: "selected-line",
        type: "line",
        source: "parcels",
        filter: ["==", ["get", "id"], ""] as never,
        paint: { "line-color": "#22d3ee", "line-width": 2.6 },
      });

      /* ---- roads ---- */
      map.addLayer({
        id: "roads-casing",
        type: "line",
        source: "roads",
        paint: {
          "line-color": "#0f172a",
          "line-opacity": 0.35,
          "line-width": ["match", ["get", "importance"], "highway", 5, "arterial", 4, 3] as never,
        },
      });
      map.addLayer({
        id: "roads",
        type: "line",
        source: "roads",
        paint: {
          "line-color": "#94a3b8",
          "line-opacity": 0.75,
          "line-width": ["match", ["get", "importance"], "highway", 2.4, "arterial", 1.8, 1.2] as never,
        },
      });

      /* ---- facilities ---- */
      const facColor: unknown[] = ["match", ["get", "ftype"]];
      for (const [t, c] of Object.entries(FACILITY_COLORS)) facColor.push(t, c);
      facColor.push("#888888");
      map.addLayer({
        id: "facilities-ring",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": 7.5,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 1.8,
          "circle-stroke-color": facColor as never,
          "circle-stroke-opacity": 0.6,
        },
      });
      map.addLayer({
        id: "facilities-circle",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": 3.8,
          "circle-color": facColor as never,
          "circle-opacity": 0.95,
        },
      });

      /* ---- interactions ---- */
      let dragging = false;
      map.on("dragstart", () => {
        dragging = true;
        setTooltip(null);
      });
      map.on("dragend", () => { dragging = false; });
      map.on("movestart", () => { setTooltip(null); });

      let hoveredId: string | null = null;
      map.on("mousemove", "parcels-fill", (e) => {
        if (dragging || map.isMoving()) return;
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        const id = f.properties?.id as string;
        if (hoveredId !== id) {
          if (hoveredId)
            map.setFeatureState({ source: "parcels", id: hoveredId }, { hover: false });
          map.setFeatureState({ source: "parcels", id }, { hover: true });
          hoveredId = id;
          setHovered(id);
        }
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          title: id,
          lines: [
            `${f.properties?.landUse} · ${f.properties?.areaHa} ha`,
            `${f.properties?.ownership === "government" ? "Government" : "Private"} owned`,
          ],
        });
      });
      map.on("mouseleave", "parcels-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredId)
          map.setFeatureState({ source: "parcels", id: hoveredId }, { hover: false });
        hoveredId = null;
        setHovered(null);
        setTooltip(null);
      });
      map.on("mousemove", "facilities-circle", (e) => {
        if (dragging || map.isMoving()) return;
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          title: f.properties?.name as string,
          lines: [FACILITY_LABELS[f.properties?.ftype as string] ?? ""],
        });
      });
      map.on("mouseleave", "facilities-circle", () => setTooltip(null));

      map.on("click", (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["parcels-fill"].filter((l) => !!map.getLayer(l)),
        });
        if (feats.length > 0) {
          selectParcel(feats[0].properties?.id as string, false);
        } else {
          setMapClick([e.lngLat.lng, e.lngLat.lat]);
        }
      });

      setReady(true);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      setMapInstance(null);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ------------------------- basemap switching -------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Basemap raster layer visibilities
    const setBm = (layer: string, show: boolean) => {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", show ? "visible" : "none");
    };

    setBm("basemap-dark", basemap === "dark");
    setBm("basemap-light", basemap === "light");
    setBm("basemap-satellite", basemap === "satellite" || basemap === "hybrid");
    setBm("basemap-terrain", basemap === "terrain");
    setBm("basemap-streets", basemap === "streets");
    setBm("basemap-hybrid-labels", basemap === "hybrid");

    const isDarkBg = basemap === "dark" || basemap === "satellite" || basemap === "hybrid";

    map.setPaintProperty("bg", "background-color", isDarkBg ? "#0b0e14" : "#e8edf4");
    map.setPaintProperty("roads-casing", "line-color", isDarkBg ? "#0f172a" : "#ffffff");
    map.setPaintProperty("roads-casing", "line-opacity", isDarkBg ? 0.4 : 0.8);
    map.setPaintProperty("roads", "line-color", isDarkBg ? "#94a3b8" : "#334155");
    map.setPaintProperty("roads", "line-opacity", isDarkBg ? 0.75 : 0.85);
    map.setPaintProperty("wards-line", "line-color", isDarkBg ? "#94a3b8" : "#475569");
    map.setPaintProperty("wards-line", "line-opacity", isDarkBg ? 0.4 : 0.65);

    if (map.getLayer("parcels-fill")) {
      map.setPaintProperty("parcels-fill", "fill-opacity", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        isDarkBg ? 0.7 : 0.78,
        isDarkBg ? 0.4 : 0.52,
      ] as never);
    }
    if (map.getLayer("parcels-line")) {
      map.setPaintProperty("parcels-line", "line-opacity", isDarkBg ? 0.8 : 0.9);
      map.setPaintProperty("parcels-line", "line-width", isDarkBg ? 0.9 : 1.2);
    }
  }, [basemap, ready]);

  /* ----------------------- layer visibility ------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    const L = activeLayers;
    const setV = (layer: string, on: boolean) => {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", vis(on));
    };
    setV("wards-fill", !!L["wards"]);
    setV("wards-line", !!L["wards"]);
    setV("parcels-fill", !!L["parcels"]);
    setV("parcels-line", !!L["parcels"]);
    setV("govt-land", !!L["govt-land"]);
    setV("zoning-conflicts", !!L["zoning-conflicts"]);
    setV("roads", !!L["roads"]);
    setV("roads-casing", !!L["roads"]);
    setV("facilities-circle", !!L["facilities"]);
    setV("facilities-ring", !!L["facilities"]);
    setV("population", !!L["population"]);
    setV("growth-heat", !!L["growth-heat"]);
    setV("gap-heat", !!L["gap-heat"]);
    setV("ndvi-heat", !!L["ndvi-heat"]);
    setV("thermal-heat", !!L["thermal-heat"]);
    setV("gap", !!L["gap"]);
    setV("prediction", !!L["prediction"]);
    for (const y of YEARS) setV(`builtup-${y}`, !!L["builtup"]);
    setV("candidates-fill", !!L["candidates"]);
    setV("candidates-line", !!L["candidates"]);

    // prediction opacity animates in
    if (map.getLayer("prediction"))
      map.setPaintProperty(
        "prediction",
        "fill-opacity",
        L["prediction"] ? layerOpacity["prediction"] ?? 0.62 : 0
      );

    // opacity sliders for heatmaps and intelligence surfaces
    const gapO = layerOpacity["gap"] ?? 0.55;
    if (map.getLayer("gap"))
      map.setPaintProperty("gap", "fill-opacity", [
        "interpolate",
        ["linear"],
        ["get", "pop"],
        1500,
        gapO * 0.15,
        20000,
        gapO,
      ] as never);

    if (map.getLayer("population"))
      map.setPaintProperty("population", "heatmap-opacity", layerOpacity["population"] ?? 0.7);
    if (map.getLayer("growth-heat"))
      map.setPaintProperty("growth-heat", "heatmap-opacity", layerOpacity["growth-heat"] ?? 0.75);
    if (map.getLayer("gap-heat"))
      map.setPaintProperty("gap-heat", "heatmap-opacity", layerOpacity["gap-heat"] ?? 0.7);
    if (map.getLayer("ndvi-heat"))
      map.setPaintProperty("ndvi-heat", "heatmap-opacity", layerOpacity["ndvi-heat"] ?? 0.7);
    if (map.getLayer("thermal-heat"))
      map.setPaintProperty("thermal-heat", "heatmap-opacity", layerOpacity["thermal-heat"] ?? 0.7);
  }, [activeLayers, ready, layerOpacity]);

  /* --------------------- year crossfade (builtup) ------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const y of YEARS) {
      if (!map.getLayer(`builtup-${y}`)) continue;
      map.setPaintProperty(
        `builtup-${y}`,
        "fill-opacity",
        activeLayers["builtup"] && y === year ? layerOpacity["builtup"] ?? 0.5 : 0
      );
    }
  }, [year, activeLayers, ready, layerOpacity]);

  /* ---------------------- parcel / ward filters --------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("ward-highlight"))
      map.setFilter("ward-highlight", ["in", ["get", "id"], ["literal", highlightedWardIds]] as never);
    if (map.getLayer("ward-highlight-line"))
      map.setFilter(
        "ward-highlight-line",
        ["in", ["get", "id"], ["literal", highlightedWardIds]] as never
      );
  }, [highlightedWardIds, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = selectedParcelId ?? "";
    if (map.getLayer("selected-glow"))
      map.setFilter("selected-glow", ["==", ["get", "id"], id] as never);
    if (map.getLayer("selected-line"))
      map.setFilter("selected-line", ["==", ["get", "id"], id] as never);
  }, [selectedParcelId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const filter =
      facilityFilter && facilityFilter !== "all"
        ? (["==", ["get", "ftype"], facilityFilter] as never)
        : null;
    if (map.getLayer("facilities-circle")) map.setFilter("facilities-circle", filter);
    if (map.getLayer("facilities-ring")) map.setFilter("facilities-ring", filter);
  }, [facilityFilter, ready]);

  /* ----------------------- site candidates -------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // cleanup old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const ids = candidates ? candidates.map((c) => c.parcel.id) : [];
    if (map.getLayer("candidates-fill"))
      map.setFilter("candidates-fill", ["in", ["get", "id"], ["literal", ids]] as never);
    if (map.getLayer("candidates-line"))
      map.setFilter("candidates-line", ["in", ["get", "id"], ["literal", ids]] as never);

    if (!candidates || candidates.length === 0) return;

    // DOM rank badges for the top 5
    candidates.slice(0, 5).forEach((c) => {
      const el = document.createElement("button");
      el.className = "ul-rank-marker";
      el.setAttribute("data-rank", `${c.rank}`);
      el.textContent = `#${c.rank}`;
      el.title = `${c.parcel.id} · Score ${c.score}/100`;
      el.onclick = (e) => {
        e.stopPropagation();
        selectParcel(c.parcel.id, true);
      };
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(c.parcel.centroid)
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [candidates, ready, selectParcel]);

  /* ------------------------ simulator pin + ring -------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (simMarkerRef.current) {
      simMarkerRef.current.remove();
      simMarkerRef.current = null;
    }
    const src = map.getSource("sim-coverage") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (simPhase === "idle" || !simResult) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const { center, radiusKm } = simResult;

    // pin marker
    const el = document.createElement("div");
    el.className = "ul-sim-pin";
    el.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>';
    simMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat(center)
      .addTo(map);

    // animated expanding ring
    let currentR = 0.2;
    const targetR = radiusKm;
    const startTime = performance.now();
    const duration = 1200;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      currentR = 0.2 + (targetR - 0.2) * eased;
      const ring = circleRing(center, currentR, 64);
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [ring] },
          },
        ],
      });
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [simPhase, simResult, ready]);

  /* --------------------------- camera ------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({
      center: flyTarget.center,
      zoom: flyTarget.zoom,
      duration: 1000,
      essential: false,
    });
  }, [flyTarget]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {tooltip && (
        <div
          className="ul-map-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="glass-strong rounded-lg px-2.5 py-1.5 shadow-elev-2">
            <div className="num text-[11.5px] font-semibold">{tooltip.title}</div>
            {tooltip.lines.map((l, i) => (
              <div key={i} className="text-[10.5px] text-muted-foreground">
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
