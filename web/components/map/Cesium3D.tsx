"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { api } from "@/lib/client";
import { LAND_USE_COLOR, OWNERSHIP_COLOR, FLOOD_COLOR } from "@/lib/ui";
import type { ParcelColorMode } from "./CityMap";

/** Load the self-hosted Cesium build once (avoids bundling Cesium via Turbopack). */
let cesiumPromise: Promise<any> | null = null;
function loadCesium(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.Cesium) return Promise.resolve(w.Cesium);
  if (cesiumPromise) return cesiumPromise;
  w.CESIUM_BASE_URL = "/cesium";
  cesiumPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("cesium-css")) {
      const l = document.createElement("link");
      l.id = "cesium-css";
      l.rel = "stylesheet";
      l.href = "/cesium/Widgets/widgets.css";
      document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = "/cesium/Cesium.js";
    s.async = true;
    s.onload = () => resolve(w.Cesium);
    s.onerror = () => reject(new Error("Failed to load Cesium"));
    document.head.appendChild(s);
  });
  return cesiumPromise;
}

const FACILITY_COLOR: Record<string, string> = {
  hospital: "#f43f5e", clinic: "#fb7185", school: "#38bdf8", college: "#0ea5e9",
  park: "#22c55e", fire_station: "#f97316", police_station: "#6366f1",
  bus_stop: "#eab308", metro_station: "#a855f7", government_office: "#14b8a6",
};

function parcelCss(mode: ParcelColorMode, p: any): string {
  const get = (k: string) => p[k]?.getValue?.() ?? p[k];
  if (mode === "development") {
    const v = get("development_potential") ?? 0;
    return v >= 80 ? "#22c55e" : v >= 60 ? "#84cc16" : v >= 45 ? "#eab308" : v >= 30 ? "#f97316" : "#ef4444";
  }
  if (mode === "landuse") return LAND_USE_COLOR[get("land_use")] ?? "#64748b";
  if (mode === "flood") return FLOOD_COLOR[get("flood_risk")] ?? "#64748b";
  return OWNERSHIP_COLOR[get("ownership")] ?? "#64748b";
}

export interface Cesium3DProps {
  parcelColorMode?: ParcelColorMode;
  showFacilities?: boolean;
  selectedParcelId?: string | null;
  onSelectParcel?: (id: string | null) => void;
}

export function Cesium3D({ parcelColorMode = "development", showFacilities = true, onSelectParcel }: Cesium3DProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<any>(null);
  const parcelDsRef = React.useRef<any>(null);
  const facDsRef = React.useRef<any>(null);
  const cesiumRef = React.useRef<any>(null);
  const modeRef = React.useRef(parcelColorMode);
  modeRef.current = parcelColorMode;
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let destroyed = false;
    loadCesium()
      .then(async (Cesium) => {
        if (destroyed || !ref.current) return;
        cesiumRef.current = Cesium;
        Cesium.Ion.defaultAccessToken = undefined;
        const viewer = new Cesium.Viewer(ref.current, {
          baseLayer: new Cesium.ImageryLayer(
            new Cesium.UrlTemplateImageryProvider({
              url: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              credit: "© OpenStreetMap © CARTO",
              maximumLevel: 19,
            })
          ),
          baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
          navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
          infoBox: false, selectionIndicator: false,
        });
        viewerRef.current = viewer;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#070b12");
        viewer.scene.skyBox.show = false;
        viewer.scene.sun.show = false;
        viewer.scene.moon.show = false;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#070b12");
        viewer.scene.fog.enabled = false;

        // Parcels — extruded by built-up %
        const fc = await api<GeoJSON.FeatureCollection>("/api/parcels");
        const pds = await Cesium.GeoJsonDataSource.load(fc, { clampToGround: false });
        parcelDsRef.current = pds;
        await viewer.dataSources.add(pds);
        styleParcels(Cesium, pds, modeRef.current);

        if (showFacilities) {
          const ffc = await api<GeoJSON.FeatureCollection>("/api/facilities");
          const fds = await Cesium.GeoJsonDataSource.load(ffc, { clampToGround: false });
          facDsRef.current = fds;
          await viewer.dataSources.add(fds);
          for (const entity of fds.entities.values) {
            entity.billboard = undefined;
            const t = entity.properties?.facility_type?.getValue?.();
            entity.point = new Cesium.PointGraphics({
              pixelSize: 5,
              color: Cesium.Color.fromCssColorString(FACILITY_COLOR[t] ?? "#94a3b8"),
              outlineColor: Cesium.Color.fromCssColorString("#0b1220"),
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
          }
        }

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(72.62, 22.94, 17000),
          orientation: { heading: Cesium.Math.toRadians(-20), pitch: Cesium.Math.toRadians(-42), roll: 0 },
          duration: 0,
        });

        // Click → select parcel
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((e: any) => {
          const picked = viewer.scene.pick(e.position);
          const id = picked?.id?.properties?.id?.getValue?.();
          if (id) onSelectParcel?.(String(id));
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      })
      .catch((err) => setError(err.message));

    return () => {
      destroyed = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed?.()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recolor on mode change
  React.useEffect(() => {
    const Cesium = cesiumRef.current;
    if (Cesium && parcelDsRef.current) styleParcels(Cesium, parcelDsRef.current, parcelColorMode);
  }, [parcelColorMode]);

  if (error)
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--bg)] text-sm text-muted">
        3D globe unavailable ({error}). Switch back to 2D.
      </div>
    );
  return <div ref={ref} className="w-full h-full" />;
}

function styleParcels(Cesium: any, ds: any, mode: ParcelColorMode) {
  for (const entity of ds.entities.values) {
    if (!entity.polygon) continue;
    const p = entity.properties;
    const built = p?.built_up_percent?.getValue?.() ?? 0;
    entity.polygon.extrudedHeight = 25 + built * 4;
    entity.polygon.material = Cesium.Color.fromCssColorString(parcelCss(mode, p)).withAlpha(0.9);
    entity.polygon.outline = false;
  }
}
