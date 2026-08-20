"use client";

/**
 * CityStage — Ahmedabad, rendered with MapLibre and driven by the same scroll
 * timeline as the globe. The city arrives as a wireframe (graticule → roads →
 * wards → parcels) and only then resolves into imagery, per the engineering
 * reveal motif; analytical layers morph on top of it as the story advances.
 */

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import {
  mapFor,
  mapParams,
  stage,
  stageOpacity,
  setSite,
  type MapParams,
} from "@/lib/landing/timeline";
import {
  builtUpFC,
  candidatesFC,
  corridorFC,
  coverageFC,
  FLAGSHIP,
  graticuleFC,
  gridFC,
  hospitalsFC,
  parcelsFC,
  proposedFC,
  ringsFC,
  roadsFC,
  wardsFC,
  winnerHaloFC,
} from "@/lib/landing/city-layers";

const DARK = ["a", "b", "c"].map(
  (s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`
);
const SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ATTRIB =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a> · Esri · UrbanLens demo dataset';

function style(): StyleSpecification {
  // maplibre v4 types omit the `*-transition` paint keys, which the runtime
  // fully supports and which are what keep the quantised updates smooth.
  const spec = {
    version: 8,
    sources: {
      dark: { type: "raster", tiles: DARK, tileSize: 256, attribution: ATTRIB },
      sat: { type: "raster", tiles: [SAT], tileSize: 256, maxzoom: 18 },
      graticule: { type: "geojson", data: graticuleFC },
      roads: { type: "geojson", data: roadsFC },
      wards: { type: "geojson", data: wardsFC },
      parcels: { type: "geojson", data: parcelsFC },
      builtup: { type: "geojson", data: builtUpFC },
      grid: { type: "geojson", data: gridFC },
      corridor: { type: "geojson", data: corridorFC, lineMetrics: true },
      coverage: { type: "geojson", data: coverageFC },
      hospitals: { type: "geojson", data: hospitalsFC },
      candidates: { type: "geojson", data: candidatesFC },
      halo: { type: "geojson", data: winnerHaloFC },
      rings: { type: "geojson", data: ringsFC },
      proposed: { type: "geojson", data: proposedFC },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#02040A" } },
      {
        id: "sat",
        type: "raster",
        source: "sat",
        paint: {
          "raster-opacity": 0,
          "raster-saturation": -0.55,
          "raster-brightness-max": 0.72,
          "raster-contrast": 0.1,
          "raster-opacity-transition": { duration: 620, delay: 0 },
        },
      },
      {
        id: "dark",
        type: "raster",
        source: "dark",
        paint: {
          "raster-opacity": 0,
          "raster-saturation": -0.3,
          "raster-opacity-transition": { duration: 520, delay: 0 },
        },
      },

      /* ── wireframe pass ─────────────────────────────────────── */
      {
        id: "graticule",
        type: "line",
        source: "graticule",
        paint: {
          "line-color": "#16D9F5",
          "line-width": 0.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 420, delay: 0 },
        },
      },
      {
        id: "roads",
        type: "line",
        source: "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#93B4D6",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2.2],
          "line-opacity": 0,
          "line-opacity-transition": { duration: 460, delay: 0 },
        },
      },
      {
        id: "ward-line",
        type: "line",
        source: "wards",
        paint: {
          "line-color": "#D7ECFF",
          "line-width": 0.8,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 460, delay: 0 },
        },
      },

      /* ── built-up expansion ─────────────────────────────────── */
      {
        id: "builtup",
        type: "fill",
        source: "builtup",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "t"],
            0,
            "#16283a",
            0.5,
            "#1d5f7a",
            1,
            "#16D9F5",
          ],
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 340, delay: 0 },
        },
      },

      /* ── 2030 growth probability ────────────────────────────── */
      {
        id: "growth",
        type: "fill",
        source: "grid",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "growth"],
            0.2,
            "#6E839B",
            0.45,
            "#E9C46A",
            0.68,
            "#FF9500",
            0.88,
            "#FF4F5D",
          ],
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 320, delay: 0 },
        },
      },

      /* ── deficit / simulation surface ───────────────────────── */
      {
        id: "gap",
        type: "fill",
        source: "grid",
        paint: {
          "fill-color": "#FF9500",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 340, delay: 0 },
        },
      },
      {
        id: "coverage-line",
        type: "line",
        source: "coverage",
        paint: {
          "line-color": "#559CFF",
          "line-width": 0.7,
          "line-dasharray": [2, 2],
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400, delay: 0 },
        },
      },
      {
        id: "coverage-fill",
        type: "fill",
        source: "coverage",
        paint: {
          "fill-color": "#559CFF",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400, delay: 0 },
        },
      },

      /* ── corridor ───────────────────────────────────────────── */
      {
        id: "corridor",
        type: "line",
        source: "corridor",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 2,
          "line-blur": 0.8,
          "line-opacity": 0,
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0,
            "#16D9F5",
            1,
            "#16D9F5",
          ],
          "line-opacity-transition": { duration: 320, delay: 0 },
        },
      },

      /* ── parcels ────────────────────────────────────────────── */
      {
        id: "parcel-fill",
        type: "fill",
        source: "parcels",
        paint: {
          "fill-color": ["case", ["==", ["get", "gov"], 1], "#559CFF", "#7E90A6"],
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 300, delay: 0 },
        },
      },
      {
        id: "parcel-line",
        type: "line",
        source: "parcels",
        paint: {
          "line-color": ["case", ["==", ["get", "gov"], 1], "#9DC4FF", "#A9B7C6"],
          "line-width": 0.7,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 300, delay: 0 },
        },
      },

      /* ── candidates + winner ────────────────────────────────── */
      {
        id: "candidate-fill",
        type: "fill",
        source: "candidates",
        paint: {
          "fill-color": ["case", ["==", ["get", "rank"], 1], "#16D9F5", "#2C7E92"],
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 320, delay: 0 },
        },
      },
      {
        id: "candidate-line",
        type: "line",
        source: "candidates",
        paint: {
          "line-color": "#B9F4FF",
          "line-width": ["case", ["==", ["get", "rank"], 1], 2, 1],
          "line-opacity": 0,
          "line-opacity-transition": { duration: 320, delay: 0 },
        },
      },
      {
        id: "winner-halo",
        type: "fill",
        source: "halo",
        paint: {
          "fill-color": "#16D9F5",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 420, delay: 0 },
        },
      },
      {
        id: "winner-extrude",
        type: "fill-extrusion",
        source: "candidates",
        filter: ["==", ["get", "rank"], 1],
        paint: {
          "fill-extrusion-color": "#16D9F5",
          "fill-extrusion-height": 0,
          "fill-extrusion-opacity": 0.5,
          "fill-extrusion-height-transition": { duration: 520, delay: 0 },
        },
      },

      /* ── simulation ─────────────────────────────────────────── */
      {
        id: "rings",
        type: "line",
        source: "rings",
        paint: {
          "line-color": "#2DD58B",
          "line-width": 1,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 220, delay: 0 },
        },
      },
      {
        id: "hospitals",
        type: "circle",
        source: "hospitals",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 14, 5.5],
          "circle-color": ["case", ["==", ["get", "kind"], "hospital"], "#FF4F5D", "#FF8A93"],
          "circle-stroke-color": "rgba(255,255,255,0.75)",
          "circle-stroke-width": 0.7,
          "circle-opacity": 0,
          "circle-stroke-opacity": 0,
          "circle-opacity-transition": { duration: 360, delay: 0 },
          "circle-stroke-opacity-transition": { duration: 360, delay: 0 },
        },
      },
      {
        id: "proposed-pulse",
        type: "circle",
        source: "proposed",
        paint: {
          "circle-radius": 6,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#2DD58B",
          "circle-stroke-width": 1.2,
          "circle-stroke-opacity": 0,
        },
      },
      {
        id: "proposed",
        type: "circle",
        source: "proposed",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 14, 8],
          "circle-color": "#2DD58B",
          "circle-stroke-color": "#02040A",
          "circle-stroke-width": 1.4,
          "circle-opacity": 0,
          "circle-opacity-transition": { duration: 320, delay: 0 },
        },
      },
    ],
  };
  return spec as unknown as StyleSpecification;
}

/* ── paint helpers: quantised updates riding MapLibre transitions ──── */

function makeSetter(map: MLMap, cache: Map<string, number | string>) {
  return {
    vis(layer: string, on: boolean) {
      const key = `${layer}|v`;
      const v = on ? 1 : 0;
      if (cache.get(key) === v) return;
      cache.set(key, v);
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", on ? "visible" : "none");
      }
    },
    num(layer: string, prop: string, value: number, step = 0.02) {
      const key = `${layer}|${prop}`;
      const q = Math.round(value / step) * step;
      if (cache.get(key) === q) return;
      cache.set(key, q);
      if (map.getLayer(layer)) {
        map.setPaintProperty(layer, prop as never, q as never, { validate: false });
      }
    },
    expr(layer: string, prop: string, token: string, build: () => unknown) {
      const key = `${layer}|${prop}`;
      if (cache.get(key) === token) return;
      cache.set(key, token);
      if (map.getLayer(layer)) {
        map.setPaintProperty(layer, prop as never, build() as never, { validate: false });
      }
    },
  };
}

const q = (v: number, s = 0.025) => Math.round(v / s) * s;

const VIS: [string[], keyof MapParams][] = [
  [["graticule"], "graticule"],
  [["roads"], "roads"],
  [["ward-line"], "wards"],
  [["parcel-fill", "parcel-line"], "parcels"],
  [["dark", "sat"], "basemap"],
  [["builtup"], "builtup"],
  [["growth"], "growth"],
  [["corridor"], "corridor"],
  [["gap"], "gap"],
  [["coverage-fill", "coverage-line"], "coverage"],
  [["hospitals"], "facilities"],
  [["candidate-fill", "candidate-line"], "candidates"],
  [["winner-halo", "winner-extrude"], "winner"],
  [["rings", "proposed", "proposed-pulse"], "catchment"],
];

function apply(set: ReturnType<typeof makeSetter>, p: MapParams, now: number) {
  for (const [layers, key] of VIS) {
    const on = (p[key] as number) > 0.004;
    for (const l of layers) set.vis(l, on);
  }

  set.num("graticule", "line-opacity", p.graticule * 0.3);
  set.num("roads", "line-opacity", p.roads * 0.6);
  set.num("ward-line", "line-opacity", p.wards * 0.4);

  // imagery resolves under the wireframe, never over it
  set.num("dark", "raster-opacity", p.basemap * 0.85);
  set.num("sat", "raster-opacity", p.basemap * 0.5);

  const bt = q(p.builtupT);
  const bo = q(p.builtup);
  set.expr("builtup", "fill-opacity", `${bt}_${bo}`, () => [
    "*",
    ["interpolate", ["linear"], ["-", bt, ["get", "t"]], -0.06, 0, 0.12, 1],
    ["+", 0.22, ["*", ["get", "t"], 0.5]],
    bo,
  ]);

  const gs = q(p.growthSweep);
  const go = q(p.growth);
  set.expr("growth", "fill-opacity", `${gs}_${go}`, () => [
    "*",
    ["interpolate", ["linear"], ["-", gs, ["get", "o"]], -0.05, 0, 0.22, 1],
    ["+", 0.1, ["*", ["get", "growth"], 0.9]],
    go * 0.72,
  ]);

  const cd = Math.max(0.006, q(p.corridorDraw, 0.03));
  set.num("corridor", "line-opacity", p.corridor * 0.9);
  set.expr("corridor", "line-gradient", `${cd}`, () => [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    "#16D9F5",
    Math.max(0.003, cd - 0.02),
    "#16D9F5",
    cd,
    "rgba(22,217,245,0)",
    1,
    "rgba(22,217,245,0)",
  ]);

  const sf = q(p.simFill, 0.03);
  const gapO = q(p.gap);
  set.expr("gap", "fill-color", `${sf}`, () => [
    "case",
    ["all", [">", ["get", "newly"], 0], ["<", ["get", "ds"], sf]],
    "#2DD58B",
    ["interpolate", ["linear"], ["get", "gap"], 0, "#E9C46A", 0.4, "#FF9500", 0.75, "#FF4F5D"],
  ]);
  set.expr("gap", "fill-opacity", `${gapO}_${sf}`, () => [
    "*",
    [
      "case",
      ["all", [">", ["get", "newly"], 0], ["<", ["get", "ds"], sf]],
      0.6,
      [
        "*",
        ["interpolate", ["linear"], ["get", "gap"], 0, 0.03, 0.12, 0.42, 0.6, 0.78],
        ["+", 0.35, ["*", ["get", "dens"], 0.65]],
      ],
    ],
    gapO,
  ]);

  set.num("coverage-fill", "fill-opacity", p.coverage * 0.045);
  set.num("coverage-line", "line-opacity", p.coverage * 0.4);

  const fs = q(p.filterStage, 0.12);
  const po = q(p.parcels);
  const fade = () =>
    ["interpolate", ["linear"], ["-", ["get", "elim"], fs], -0.35, 0.02, 0.55, 1] as unknown;
  set.expr("parcel-fill", "fill-opacity", `${fs}_${po}`, () => ["*", fade(), po * 0.4]);
  set.expr("parcel-line", "line-opacity", `${fs}_${po}`, () => ["*", fade(), po * 0.8]);

  set.num("candidate-fill", "fill-opacity", p.candidates * 0.5);
  set.num("candidate-line", "line-opacity", p.candidates);
  set.num("winner-halo", "fill-opacity", p.winner * 0.1);
  set.num("winner-extrude", "fill-extrusion-height", p.winner * 210, 5);
  set.num("winner-extrude", "fill-extrusion-opacity", p.winner * 0.45);

  const cp = q(p.catchment, 0.02);
  const co = q(Math.min(1, p.catchment * 3));
  set.expr("rings", "line-opacity", `${cp}_${co}`, () => [
    "*",
    ["interpolate", ["linear"], ["-", cp, ["get", "rn"]], -0.03, 0, 0.05, 0.85, 0.45, 0.15],
    co,
  ]);

  set.num("hospitals", "circle-opacity", p.facilities * 0.95);
  set.num("hospitals", "circle-stroke-opacity", p.facilities * 0.45);
  set.num("proposed", "circle-opacity", Math.min(1, p.catchment * 4));

  const pulse = (now / 2200) % 1;
  set.num("proposed-pulse", "circle-radius", 6 + pulse * 30, 0.5);
  set.num(
    "proposed-pulse",
    "circle-stroke-opacity",
    Math.min(1, p.catchment * 4) * (1 - pulse) * 0.7,
    0.03
  );
}

export default function CityStage() {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    setSite(FLAGSHIP.centroid as [number, number]);

    const compact = window.matchMedia("(max-width: 860px)").matches;
    const c0 = mapFor(3, compact);

    const map = new maplibregl.Map({
      container: host.current,
      style: style(),
      center: c0.center,
      zoom: c0.zoom,
      bearing: c0.bearing,
      pitch: c0.pitch,
      interactive: false,
      attributionControl: false,
      fadeDuration: 140,
      maxZoom: 15.5,
      renderWorldCopies: false,
    });

    const px = Math.min(window.devicePixelRatio || 1, 1.6);
    const withRatio = map as MLMap & { setPixelRatio?: (n: number) => void };
    withRatio.setPixelRatio?.(px);

    const cache = new Map<string, number | string>();
    const set = makeSetter(map, cache);
    let raf = 0;
    let lastT = -1;
    let ready = false;

    const markReady = () => {
      if (!ready) {
        ready = true;
        map.resize();
      }
    };
    map.on("style.load", markReady);
    map.on("load", markReady);
    const fallback = window.setTimeout(markReady, 2500);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const vis = stageOpacity(stage.T).map;
      if (wrap.current) wrap.current.style.opacity = vis.toFixed(3);
      if (!ready || vis < 0.004) return;

      const T = stage.T;
      if (Math.abs(T - lastT) > 0.00002) {
        lastT = T;
        const k = mapFor(T, compact);
        const w = map.getContainer().clientWidth;
        const padX = k.pad * w;
        map.jumpTo({
          center: k.center,
          zoom: k.zoom,
          bearing: k.bearing,
          pitch: k.pitch,
          padding: {
            top: 0,
            bottom: 0,
            left: padX > 0 ? padX : 0,
            right: padX < 0 ? -padX : 0,
          },
        });
      }
      apply(set, mapParams(T), now);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(host.current);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
      ro.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div
      ref={wrap}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0 }}
      aria-hidden
    >
      <div ref={host} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div className="ul-map-veil pointer-events-none absolute inset-0" />
    </div>
  );
}
