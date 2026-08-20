"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
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
  vegetationFC,
  greenspaceFC,
  thermalRasterURL,
  THERMAL_BOUNDS,
  landUseColorExpr,
  FACILITY_COLORS,
  FACILITY_LABELS,
} from "@/lib/mapdata";
import { circleRing, ringsBounds } from "@/lib/geo";
import { WARDS } from "@/data/wards";
import { setMapInstance } from "@/lib/mapref";
import { refreshThermalStatus, THERMAL_STATUS, useThermalStatus } from "@/data/thermal";
import type { Year } from "@/types";
import { m2 } from "@/lib/marks";
import { YEARS } from "@/types";

const CARTO_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

function rasterTiles(style: "dark_all" | "light_all"): string[] {
  return ["a", "b", "c", "d"].map(
    (s) => `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`
  );
}

/**
 * MapLibre image-source corners for the LST raster: [top-left, top-right,
 * bottom-right, bottom-left].
 *
 * The extent must come from the backend, which decides what it fetched and
 * reports it on /api/thermal/status. Pinning it to a constant here silently
 * rescales the scene whenever the fetch bbox changes — a statewide raster
 * drawn into a metro-sized box is compressed ~8x and sits over the wrong
 * ground. THERMAL_BOUNDS is only the pre-status fallback.
 */
function thermalCorners(
  bounds: [number, number, number, number] | null
): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = bounds ?? THERMAL_BOUNDS;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/** Clears the left ModeRail and the right Intelligence Panel. */
const FRAME_PADDING = { top: 80, bottom: 80, left: 100, right: 390 };

/**
 * Point the camera at the study area.
 *
 * Prefers the extent of the wards actually loaded. The city config's `center`,
 * `zoom` and `bounds` describe the whole *district* envelope, not the study
 * area: for Ahmedabad that centre sits 37 km south-west of the AMC wards, and
 * fitting those bounds lands around zoom 7.6 where the wards span 26 km and
 * need ~12.7. Every city was framed 2-5 zoom levels too far out, which is why
 * the map opened on half of Gujarat with the parcels as a coloured speck.
 *
 * The config values remain the fallback for the moment before a city's data has
 * loaded, and for anything that has no ward geometry.
 */
function frameStudyArea(map: MLMap, city: typeof ACTIVE_CITY, duration: number): void {
  const bounds = ringsBounds(WARDS.map((w) => w.ring)) ?? (
    city.bounds && city.bounds.length === 2 ? city.bounds : null
  );
  if (bounds) {
    try {
      map.fitBounds(bounds, { padding: FRAME_PADDING, maxZoom: 14, duration, essential: true });
      return;
    } catch {
      // Non-standard bounds — fall through to the centre/zoom below.
    }
  }
  map.flyTo({
    center: city.growthCenter ?? city.center,
    zoom: 12.4,
    duration,
    essential: true,
  });
}

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const simMarkerRef = useRef<Marker | null>(null);
  const rafRef = useRef<number>(0);
  const thermalUrlRef = useRef<string | null>(null);
  // Version each expensive GeoJSON source so invisible layers are not parsed by
  // MapLibre until somebody actually turns them on.
  const sourceVersionRef = useRef<Record<string, number>>({});
  // The swap effect must run once per loaded dataset. `city` changes identity
  // twice per switch (before and after its data arrives); only the second
  // commit has fresh arrays, so gate on the applied data version.
  const appliedDatasetVersionRef = useRef(0);

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
  const corridorPath = useApp((s) => s.corridorPath);
  const city = useApp((s) => s.city);
  const datasetVersion = useApp((s) => s.datasetVersion);
  const thermal = useThermalStatus();

  /* --------------------------- corridor ---------------------------- */
  // The routed alignment lives in the store rather than in this component so
  // the panel that produced it and the map that draws it cannot disagree.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("corridor") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(
      corridorPath && corridorPath.length > 1
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: corridorPath },
              },
            ],
          }
        : { type: "FeatureCollection", features: [] }
    );
  }, [corridorPath, ready]);

  /* ------------------------- thermal status ------------------------- */
  // Thermal data is lazy: do not wake the Python service on normal dashboard load.

  // Refresh whenever the UHI layer is switched on, and re-point the raster at
  // the committed file (cache-busted by updated_at) once we know the date.
  useEffect(() => {
    if (activeLayers["thermal-heat"]) refreshThermalStatus();
    const map = mapRef.current;
    if (!map || !ready || !thermal.date) return;
    const src = map.getSource("thermal-raster") as maplibregl.ImageSource | undefined;
    if (src) {
      const url = thermalRasterURL(thermal.updated_at ?? undefined);
      // Keyed on bounds too: the scene is re-placed when the backend widens or
      // narrows its fetch bbox, not only when the image itself changes.
      const key = `${url}|${(thermal.bounds ?? THERMAL_BOUNDS).join(",")}`;
      if (thermalUrlRef.current === key) return;
      thermalUrlRef.current = key;
      try {
        src.updateImage({ url, coordinates: thermalCorners(thermal.bounds) });
      } catch {
        // updateImage aborts any in-flight image load; ignore if it throws
        // during mount/teardown (e.g. WebGL context already lost).
      }
    }
  }, [activeLayers, ready, thermal]);

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
              "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
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
          { id: "basemap-dark", type: "raster", source: "carto-dark", layout: { visibility: "none" } },
          { id: "basemap-light", type: "raster", source: "carto-light", layout: { visibility: "none" } },
          { id: "basemap-satellite", type: "raster", source: "esri-satellite", layout: { visibility: "none" } },
          { id: "basemap-terrain", type: "raster", source: "esri-topo" },
          { id: "basemap-streets", type: "raster", source: "carto-voyager", layout: { visibility: "none" } },
          { id: "basemap-hybrid-labels", type: "raster", source: "esri-labels", layout: { visibility: "none" } },
        ],
      },
      center: [72.5714, 23.0225],
      zoom: 12.4,
      minZoom: 5,
      maxZoom: 18,
      attributionControl: false,
    });
    mapRef.current = map;
    setMapInstance(map);

    map.on("load", () => {
      /* ---- sources ---- */
      // Sources start empty. The real CDN bootstrap is pushed exactly once by
      // the datasetVersion effect; parsing the synthetic fallback here would
      // duplicate MapLibre worker work during startup.
      map.addSource("parcels", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      });
      map.addSource("wards", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
      map.addSource("roads", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("facilities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      for (const y of YEARS)
        map.addSource(`builtup-${y}`, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("prediction", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("population", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("growth-heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("gap-heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("vegetation", { type: "geojson", data: vegetationFC(), promoteId: "id" });
      map.addSource("greenspace", { type: "geojson", data: greenspaceFC() });
      // Corridor alignment — empty until the corridor panel routes one.
      map.addSource("corridor", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("thermal-raster", {
        type: "image",
        // MapLibre's image source decoder does not support GIFs. A tiny
        // transparent PNG keeps the source valid until a real LST raster is
        // requested, without an eager /static/thermal request.
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5nAAAAABJRU5ErkJggg==",
        coordinates: thermalCorners(THERMAL_STATUS().bounds),
      });
      // Swallow maplibre's ErrorEvent logging: updateImage() aborts the
      // initial load() on mount, which fires an 'error' event with no
      // listeners and gets console.error'd by maplibre's Evented.
      (map.getSource("thermal-raster") as maplibregl.ImageSource | undefined)?.on(
        "error",
        () => {}
      );
      map.addSource("gap", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("sim-coverage", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      /* ---- intelligence surfaces (under vectors) ---- */
      for (const y of YEARS) {
        map.addLayer({
          id: `builtup-${y}`,
          // ESRI's fractional observations are drawn as a continuous field.
          // This deliberately avoids exposing the coarse display-grid cells as
          // boxes: opacity and colour density now represent built-up share.
          type: "heatmap",
          source: `builtup-${y}`,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["get", "amount"],
              0,
              0,
              0.15,
              0.08,
              1,
              1,
            ] as never,
            // Radius scales with zoom so adjacent sampled cells blend into a
            // fluid urban spread at every useful planning scale.
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              22,
              11,
              48,
              13,
              96,
              15,
              180,
            ] as never,
            "heatmap-intensity": 1.1,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(245, 158, 11, 0)",
              0.16,
              "rgba(251, 191, 36, 0.16)",
              0.42,
              "rgba(245, 158, 11, 0.48)",
              0.7,
              "rgba(234, 88, 12, 0.75)",
              1,
              "rgba(154, 52, 18, 0.96)",
            ] as never,
            "heatmap-opacity": 0,
          },
          layout: { visibility: "none" },
        });
        map.setPaintProperty(`builtup-${y}`, "heatmap-opacity-transition", {
          duration: 650,
        } as never);
      }
      map.addLayer({
        id: "prediction",
        // A weighted heatmap communicates gradual expansion likelihood without
        // revealing the coarse analysis grid as hard-edged boxes.
        type: "heatmap",
        source: "prediction",
        paint: {
          "heatmap-weight": ["get", "p"] as never,
          "heatmap-intensity": 1.15,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            20,
            11,
            44,
            13,
            84,
            15,
            160,
          ] as never,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(251, 191, 36, 0)",
            0.14,
            "rgba(250, 204, 21, 0.18)",
            0.34,
            "rgba(251, 146, 60, 0.5)",
            0.58,
            "rgba(248, 113, 113, 0.78)",
            0.82,
            "rgba(220, 38, 38, 0.96)",
          ] as never,
          "heatmap-opacity": 0,
        },
        layout: { visibility: "none" },
      });
      map.setPaintProperty("prediction", "heatmap-opacity-transition", {
        duration: 650,
      } as never);
      map.addLayer({
        id: "gap",
        // Weighted points make service deficits read as a continuous area of
        // need, instead of the underlying analysis cells.
        type: "heatmap",
        source: "gap",
        paint: {
          "heatmap-weight": ["get", "score"] as never,
          "heatmap-intensity": 1.2,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            20,
            11,
            44,
            13,
            88,
            15,
            168,
          ] as never,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(251, 146, 60, 0)",
            0.16,
            "rgba(251, 146, 60, 0.22)",
            0.4,
            "rgba(239, 68, 68, 0.58)",
            0.68,
            "rgba(185, 28, 28, 0.82)",
            1,
            "rgba(127, 29, 29, 0.98)",
          ] as never,
          "heatmap-opacity": 0,
        },
        layout: { visibility: "none" },
      });
      map.setPaintProperty("gap", "heatmap-opacity-transition", {
        duration: 650,
      } as never);

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

      // 4. Vegetation / NDVI — per-ward choropleth from the real Sentinel-2 layer
      map.addLayer({
        id: "ndvi-heat",
        type: "fill",
        source: "vegetation",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "ndvi_mean"],
            -0.1,
            "#a16207",
            0.15,
            "#d9f99d",
            0.35,
            "#84cc16",
            0.55,
            "#22c55e",
            0.75,
            "#14532d",
          ] as never,
          "fill-opacity": 0.75,
        },
        layout: { visibility: "none" },
      });

      // 5. Urban Heat Island (UHI) — MODIS LST raster (local file, auto-refreshed)
      map.addLayer({
        id: "thermal-heat",
        type: "raster",
        source: "thermal-raster",
        paint: {
          "raster-opacity": 0.7,
          "raster-resampling": "linear",
          "raster-fade-duration": 150,
        },
        layout: { visibility: "none" },
      });

      // Greenspace — real green polygons (parks + green landuse)
      map.addLayer({
        id: "greenspace",
        type: "fill",
        source: "greenspace",
        paint: {
          "fill-color": "#16a34a",
          "fill-opacity": 0.45,
        },
        layout: { visibility: "none" },
      });
      map.addLayer({
        id: "greenspace-line",
        type: "line",
        source: "greenspace",
        paint: { "line-color": "#15803d", "line-width": 1.2, "line-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      /* ---- routed corridor ---- */
      map.addLayer({
        id: "corridor-casing",
        type: "line",
        source: "corridor",
        paint: { "line-color": "#0f172a", "line-width": 7, "line-opacity": 0.55 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "corridor-line",
        type: "line",
        source: "corridor",
        paint: { "line-color": "#22d3ee", "line-width": 3.2, "line-opacity": 0.95 },
        layout: { "line-cap": "round", "line-join": "round" },
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
      map.addLayer({
        id: "flood-risk",
        type: "fill",
        source: "parcels",
        paint: {
          "fill-color": [
            "match",
            ["get", "floodRisk"],
            "high",
            "#ef4444",
            "medium",
            "#f59e0b",
            "low",
            "#22c55e",
            "rgba(0,0,0,0)",
          ] as never,
          "fill-opacity": 0.5,
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

      map.on("mousemove", "greenspace", (e) => {
        if (dragging || map.isMoving()) return;
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        const p = f.properties ?? {};
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          title: (p.name as string) || "Green Space",
          lines: [
            p.category ? `Category · ${p.category}` : "",
            p.area_sqm ? `Area · ${(p.area_sqm / 10000).toFixed(2)} ha` : "",
          ].filter(Boolean),
        });
      });
      map.on("mouseleave", "greenspace", () => setTooltip(null));

      map.on("mousemove", "vegetation", (e) => {
        if (dragging || map.isMoving()) return;
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        const p = f.properties ?? {};
        const ndvi = typeof p.ndvi_mean === "number" ? p.ndvi_mean : null;
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          title: (p.name as string) || "Ward",
          lines: [ndvi !== null ? `NDVI · ${ndvi.toFixed(2)}` : ""].filter(Boolean),
        });
      });
      map.on("mouseleave", "vegetation", () => setTooltip(null));

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

  
  /* --------------------- study-area dataset swapping -------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || datasetVersion === 0) return;
    m2("map:eff:start");
    if (appliedDatasetVersionRef.current === datasetVersion) return;

    const push = (id: string, data: FeatureCollection) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      src?.setData(data);
    };
    // Core Overview only. Expensive analytical sources are populated lazily
    // below when their layer becomes visible.
    push("parcels", parcelsFC());
    push("wards", wardsFC());
    push("roads", roadsFC());
    push("facilities", facilitiesFC());
    sourceVersionRef.current = {
      parcels: datasetVersion, wards: datasetVersion, roads: datasetVersion, facilities: datasetVersion,
    };
    push("vegetation", vegetationFC());
    push("greenspace", greenspaceFC());
    push("sim-coverage", { type: "FeatureCollection", features: [] });
    try {
      if (typeof window !== "undefined" && (window as any).__M2) (window as any).__map = map;
    } catch {}

    // Authoritative framing: the wards that were actually loaded.
    frameStudyArea(map, city, 450);
    appliedDatasetVersionRef.current = datasetVersion;
    m2("map:eff:done");
  }, [datasetVersion, ready, city]);

  /* ---------------- lazy intelligence source population ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || datasetVersion === 0) return;
    m2("map:ensure:start");
    const ensure = (id: string, build: () => FeatureCollection) => {
      if (sourceVersionRef.current[id] === datasetVersion) return;
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(build());
      sourceVersionRef.current[id] = datasetVersion;
    };

    if (activeLayers["prediction"]) ensure("prediction", predictionFC);
    if (activeLayers["population"]) ensure("population", populationFC);
    if (activeLayers["growth-heat"]) ensure("growth-heat", growthHeatFC);
    if (activeLayers["gap-heat"]) ensure("gap-heat", gapHeatFC);
    if (activeLayers["gap"]) ensure("gap", gapFC);
    if (activeLayers["builtup"]) {
      for (const y of YEARS) ensure(`builtup-${y}`, () => builtupFC(y));
    }
    m2("map:ensure:done");
  }, [activeLayers, datasetVersion, ready]);

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
    setV("flood-risk", !!L["flood-risk"]);
    setV("roads", !!L["roads"]);
    setV("roads-casing", !!L["roads"]);
    setV("facilities-circle", !!L["facilities"]);
    setV("facilities-ring", !!L["facilities"]);
    setV("population", !!L["population"]);
    setV("growth-heat", !!L["growth-heat"]);
    setV("gap-heat", !!L["gap-heat"]);
    setV("ndvi-heat", !!L["ndvi-heat"]);
    setV("thermal-heat", !!L["thermal-heat"] && !!thermal.date);
    setV("greenspace", !!L["greenspace"]);
    setV("greenspace-line", !!L["greenspace"]);
    setV("gap", !!L["gap"]);
    setV("prediction", !!L["prediction"]);
    for (const y of YEARS) setV(`builtup-${y}`, !!L["builtup"]);
    setV("candidates-fill", !!L["candidates"]);
    setV("candidates-line", !!L["candidates"]);

    // prediction opacity animates in
    if (map.getLayer("prediction"))
      map.setPaintProperty(
        "prediction",
        "heatmap-opacity",
        L["prediction"] ? layerOpacity["prediction"] ?? 0.62 : 0
      );

    // opacity sliders for heatmaps and intelligence surfaces
    const gapO = layerOpacity["gap"] ?? 0.62;
    if (map.getLayer("gap"))
      map.setPaintProperty("gap", "heatmap-opacity", L["gap"] ? gapO : 0);

    if (map.getLayer("population"))
      map.setPaintProperty("population", "heatmap-opacity", layerOpacity["population"] ?? 0.7);
    if (map.getLayer("growth-heat"))
      map.setPaintProperty("growth-heat", "heatmap-opacity", layerOpacity["growth-heat"] ?? 0.75);
    if (map.getLayer("gap-heat"))
      map.setPaintProperty("gap-heat", "heatmap-opacity", layerOpacity["gap-heat"] ?? 0.7);
    if (map.getLayer("ndvi-heat"))
      map.setPaintProperty("ndvi-heat", "fill-opacity", layerOpacity["ndvi-heat"] ?? 0.75);
    if (map.getLayer("thermal-heat"))
      map.setPaintProperty("thermal-heat", "raster-opacity", layerOpacity["thermal-heat"] ?? 0.7);
    if (map.getLayer("greenspace"))
      map.setPaintProperty("greenspace", "fill-opacity", layerOpacity["greenspace"] ?? 0.45);
    if (map.getLayer("flood-risk"))
      map.setPaintProperty("flood-risk", "fill-opacity", layerOpacity["flood-risk"] ?? 0.5);
  }, [activeLayers, ready, layerOpacity, thermal]);

  /* --------------------- year crossfade (fluid builtup) -------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const y of YEARS) {
      if (!map.getLayer(`builtup-${y}`)) continue;
      map.setPaintProperty(
        `builtup-${y}`,
        "heatmap-opacity",
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
    for (const m of markersRef.current) {
      try {
        m.remove();
      } catch {
        // ignore
      }
    }
    markersRef.current = [];

    const shouldShow =
      (mode === "sites" || activeLayers["candidates"]) &&
      Boolean(candidates && candidates.length > 0);

    const ids = shouldShow && candidates ? candidates.map((c) => c.parcel.id) : [];
    if (map.getLayer("candidates-fill"))
      map.setFilter("candidates-fill", ["in", ["get", "id"], ["literal", ids]] as never);
    if (map.getLayer("candidates-line"))
      map.setFilter("candidates-line", ["in", ["get", "id"], ["literal", ids]] as never);

    if (!shouldShow || !candidates) return;

    // DOM rank badges for the top 5 with strict coordinate validation
    candidates.slice(0, 5).forEach((c) => {
      const centroid = c.parcel?.centroid;
      if (
        !centroid ||
        !Array.isArray(centroid) ||
        centroid.length < 2 ||
        typeof centroid[0] !== "number" ||
        typeof centroid[1] !== "number" ||
        isNaN(centroid[0]) ||
        isNaN(centroid[1]) ||
        centroid[0] < 68 || // Gujarat longitude bounds [68, 76]
        centroid[0] > 76 ||
        centroid[1] < 20 || // Gujarat latitude bounds [20, 25]
        centroid[1] > 25
      ) {
        return; // Skip invalid coordinates to prevent orphan (0, 0) top-left markers
      }

      const el = document.createElement("button");
      el.className = "ul-rank-marker";
      el.setAttribute("data-rank", `${c.rank}`);
      el.textContent = `#${c.rank}`;
      el.title = `${c.parcel.id} · Score ${c.score}/100`;
      el.onclick = (e) => {
        e.stopPropagation();
        selectParcel(c.parcel.id, true);
      };
      try {
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(centroid as [number, number])
          .addTo(map);
        markersRef.current.push(marker);
      } catch {
        // ignore
      }
    });

    return () => {
      for (const m of markersRef.current) {
        try {
          m.remove();
        } catch {
          // ignore
        }
      }
      markersRef.current = [];
    };
  }, [candidates, ready, mode, activeLayers, selectParcel]);

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

  /* Provisional framing the moment the city changes, before its data lands.
     The dataset effect above re-frames authoritatively once WARDS is current. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    frameStudyArea(map, city, 1500);
  }, [city.id, ready]);

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
