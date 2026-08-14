"use client";

import * as React from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification, ExpressionSpecification } from "maplibre-gl";
import { api, loadGeo } from "@/lib/client";
import { LAND_USE_COLOR, OWNERSHIP_COLOR, FLOOD_COLOR } from "@/lib/ui";

export type LayerKey =
  | "boundary"
  | "wards"
  | "population"
  | "prediction"
  | "parcels"
  | "conflicts"
  | "roads"
  | "facilities";
export type ParcelColorMode = "ownership" | "development" | "landuse" | "flood";
export type WardMetric = "none" | "infrastructure" | "livability" | "population";

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  color?: string;
  pulse?: boolean;
  /** Optional text rendered inside the pin (e.g. a rank number). */
  text?: string;
}

export interface CityMapProps {
  layers: LayerKey[];
  parcelColorMode?: ParcelColorMode;
  wardMetric?: WardMetric;
  facilityTypes?: string[]; // undefined = all
  parcelFilter?: { ownership?: "government" | "private"; vacantOnly?: boolean };
  selectedParcelId?: string | null;
  highlightParcelIds?: string[];
  /** When set, parcels are coloured by their built-up % in this year (time machine). */
  builtYear?: number | null;
  markers?: MapMarker[];
  onSelectParcel?: (id: string | null) => void;
  onMapClick?: (lng: number, lat: number) => void;
  focus?: { lng: number; lat: number; zoom?: number } | null;
  /** Initial view. MapView fills these from the active city. */
  center?: [number, number];
  zoom?: number;
  className?: string;
}

const CENTER: [number, number] = [72.5714, 23.0225];

function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution:
          '© OpenStreetMap © CARTO · wards: municipal ward map · parcels: demo data',
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#070b12" } },
      { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85, "raster-brightness-max": 0.9 } },
    ],
  };
}

function parcelFillColor(mode: ParcelColorMode): ExpressionSpecification {
  switch (mode) {
    case "development":
      return [
        "interpolate", ["linear"], ["get", "development_potential"],
        0, "#ef4444", 40, "#f97316", 60, "#eab308", 80, "#84cc16", 100, "#22c55e",
      ];
    case "landuse":
      return [
        "match", ["get", "land_use"],
        ...(Object.entries(LAND_USE_COLOR).flatMap(([k, v]) => [k, v]) as string[]),
        "#64748b",
      ] as unknown as ExpressionSpecification;
    case "flood":
      return [
        "match", ["get", "flood_risk"],
        "low", FLOOD_COLOR.low, "medium", FLOOD_COLOR.medium, "high", FLOOD_COLOR.high,
        "#64748b",
      ];
    case "ownership":
    default:
      return [
        "match", ["get", "ownership"],
        "government", OWNERSHIP_COLOR.government, "private", OWNERSHIP_COLOR.private,
        "#64748b",
      ];
  }
}

const FACILITY_COLOR: Record<string, string> = {
  hospital: "#f43f5e", clinic: "#fb7185", school: "#38bdf8", college: "#0ea5e9",
  park: "#22c55e", fire_station: "#f97316", police_station: "#6366f1",
  bus_stop: "#eab308", metro_station: "#a855f7", government_office: "#14b8a6",
};

function facilityColorExpr(): ExpressionSpecification {
  return [
    "match", ["get", "facility_type"],
    ...(Object.entries(FACILITY_COLOR).flatMap(([k, v]) => [k, v]) as string[]),
    "#94a3b8",
  ] as unknown as ExpressionSpecification;
}

export function CityMap(props: CityMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markersRef = React.useRef<maplibregl.Marker[]>([]);
  const hoverRef = React.useRef<string | null>(null);
  const highlightRef = React.useRef<string[]>([]);
  const selectedRef = React.useRef<string | null>(null);
  const propsRef = React.useRef(props);
  propsRef.current = props;
  const [ready, setReady] = React.useState(false);

  // ---- init map once ----
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(),
      center: propsRef.current.center ?? CENTER,
      zoom: propsRef.current.zoom ?? 10.8,
      attributionControl: { compact: true },
      maxZoom: 17,
      minZoom: 8,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => setupLayers(map).then(() => setReady(true)));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setupLayers(map: maplibregl.Map) {
    const want = new Set(propsRef.current.layers);
    // sources
    map.addSource("boundary", { type: "geojson", data: emptyFC() });
    map.addSource("wards", { type: "geojson", data: emptyFC(), promoteId: "ward_code" });
    map.addSource("population", { type: "geojson", data: emptyFC() });
    map.addSource("prediction", { type: "geojson", data: emptyFC() });
    map.addSource("parcels", { type: "geojson", data: emptyFC(), promoteId: "id" });
    map.addSource("conflicts", { type: "geojson", data: emptyFC() });
    map.addSource("roads", { type: "geojson", data: emptyFC() });
    map.addSource("facilities", { type: "geojson", data: emptyFC() });

    // boundary
    map.addLayer({ id: "boundary-fill", source: "boundary", type: "fill", paint: { "fill-color": "#38bdf8", "fill-opacity": 0.03 } });
    map.addLayer({ id: "boundary-line", source: "boundary", type: "line", paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.5, "line-dasharray": [3, 2] } });

    // wards
    map.addLayer({
      id: "ward-fill", source: "wards", type: "fill",
      paint: { "fill-color": wardColor(propsRef.current.wardMetric ?? "none"), "fill-opacity": propsRef.current.wardMetric && propsRef.current.wardMetric !== "none" ? 0.4 : 0 },
    });
    map.addLayer({ id: "ward-line", source: "wards", type: "line", paint: { "line-color": "#2a3a4f", "line-width": 0.8, "line-opacity": 0.8 } });

    // population density heatmap (250 m raster cells → weighted heat).
    // heatmap-weight is rescaled to the city's own max density on load.
    map.addLayer({
      id: "population-heat",
      source: "population",
      type: "heatmap",
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "density"], 0, 0, 40000, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 14, 2.2],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 12, 14, 34],
        "heatmap-opacity": 0.65,
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(11,34,51,0)",
          0.2, "#0e4a6e",
          0.4, "#0ea5e9",
          0.6, "#eab308",
          0.8, "#f97316",
          1, "#ef4444",
        ],
      },
    });

    // prediction
    map.addLayer({
      id: "prediction-fill", source: "prediction", type: "fill",
      paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "growth_probability"], 0, "#1d4ed8", 0.3, "#0ea5e9", 0.5, "#eab308", 0.7, "#f97316", 0.9, "#ef4444"],
        "fill-opacity": 0.45,
      },
    });

    // parcels
    map.addLayer({
      id: "parcel-fill", source: "parcels", type: "fill",
      paint: {
        "fill-color": parcelFillColor(propsRef.current.parcelColorMode ?? "ownership"),
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, 0.6],
      },
    });
    map.addLayer({
      id: "parcel-line", source: "parcels", type: "line",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false], "#ffffff",
          ["boolean", ["feature-state", "highlight"], false], "#22d3ee",
          ["boolean", ["feature-state", "hover"], false], "#cbd5e1",
          "#0b1220",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false], 2.5,
          ["boolean", ["feature-state", "highlight"], false], 2,
          ["boolean", ["feature-state", "hover"], false], 1.5,
          0.4,
        ],
      },
    });

    // roads + river
    map.addLayer({
      id: "river-line", source: "roads", type: "line",
      filter: ["==", ["get", "road_type"], "river"],
      paint: { "line-color": "#0ea5e9", "line-width": 3, "line-opacity": 0.5, "line-blur": 1 },
    });
    map.addLayer({
      id: "road-line", source: "roads", type: "line",
      filter: ["!=", ["get", "road_type"], "river"],
      paint: {
        "line-color": ["match", ["get", "road_type"], "ring", "#f59e0b", "#64748b"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, ["*", ["get", "importance"], 1.5], 14, ["*", ["get", "importance"], 4]],
        "line-opacity": 0.7,
      },
    });

    // facilities
    map.addLayer({
      id: "facility-circle", source: "facilities", type: "circle",
      paint: {
        "circle-color": facilityColorExpr(),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6],
        "circle-stroke-color": "#0b1220",
        "circle-stroke-width": 1,
        "circle-opacity": 0.95,
      },
    });

    // zoning conflicts — official designation vs detected land use (PRD §21)
    map.addLayer({
      id: "conflict-halo",
      source: "conflicts",
      type: "circle",
      paint: {
        "circle-color": ["match", ["get", "severity"], "high", "#ef4444", "#f97316"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 14],
        "circle-opacity": 0.16,
        "circle-stroke-color": ["match", ["get", "severity"], "high", "#ef4444", "#f97316"],
        "circle-stroke-width": 1.4,
        "circle-stroke-opacity": 0.9,
      },
    });

    map.on("mouseenter", "conflict-halo", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "conflict-halo", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "conflict-halo", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties ?? {};
      new maplibregl.Popup({ closeButton: false, offset: 12 })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div style="font-size:12px;line-height:1.45">
             <div style="font-weight:600">${p.type ?? "Zoning conflict"}</div>
             <div style="color:#8ea1b8">Official: <b style="color:#cbd5e1">${String(p.official ?? "").replace(/_/g, " ")}</b></div>
             <div style="color:#8ea1b8">Detected: <b style="color:#cbd5e1">${String(p.detected ?? "").replace(/_/g, " ")}</b></div>
             <div style="color:#64748b;margin-top:2px">${p.parcel_id ?? ""}</div>
           </div>`
        )
        .addTo(map);
    });

    // interactions
    map.on("click", "parcel-fill", (e) => {
      const f = e.features?.[0];
      if (f) propsRef.current.onSelectParcel?.(String(f.properties?.id));
    });
    map.on("click", (e) => {
      // generic click (used by simulator); ignore if a parcel was clicked
      const hits = map.queryRenderedFeatures(e.point, { layers: ["parcel-fill"] });
      if (!hits.length) propsRef.current.onMapClick?.(e.lngLat.lng, e.lngLat.lat);
      else propsRef.current.onMapClick?.(e.lngLat.lng, e.lngLat.lat);
    });
    map.on("mousemove", "parcel-fill", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const id = String(f.properties?.id);
      if (hoverRef.current && hoverRef.current !== id)
        map.setFeatureState({ source: "parcels", id: hoverRef.current }, { hover: false });
      hoverRef.current = id;
      map.setFeatureState({ source: "parcels", id }, { hover: true });
    });
    map.on("mouseleave", "parcel-fill", () => {
      map.getCanvas().style.cursor = "";
      if (hoverRef.current) map.setFeatureState({ source: "parcels", id: hoverRef.current }, { hover: false });
      hoverRef.current = null;
    });
    map.on("mouseenter", "facility-circle", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "facility-circle", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "facility-circle", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      new maplibregl.Popup({ closeButton: false, offset: 10 })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div style="font-size:12px"><div style="font-weight:600">${f.properties?.name ?? ""}</div><div style="color:#8ea1b8;text-transform:capitalize">${String(f.properties?.facility_type ?? "").replace(/_/g, " ")}</div></div>`
        )
        .addTo(map);
    });

    await loadLayerData(map, want);
  }

  /** Fetches each requested layer for the active city and pushes it to its source. */
  async function loadLayerData(map: maplibregl.Map, want: Set<LayerKey>) {
    await Promise.all(
      Array.from(want).map(async (key) => {
        try {
          if (key === "boundary") {
            const b = await api<{ boundary: GeoJSON.Feature }>("/api/boundary");
            (map.getSource("boundary") as maplibregl.GeoJSONSource)?.setData(
              b.boundary as unknown as GeoJSON.GeoJSON
            );
          } else {
            const data = await loadGeo(
              key === "parcels" && propsRef.current.parcelFilter
                ? parcelUrl(propsRef.current.parcelFilter)
                : key
            );
            (map.getSource(key) as maplibregl.GeoJSONSource)?.setData(data);

            // Rescale the heatmap ramp to this city's actual peak density, so
            // Gandhinagar (~4k/km²) is not washed out by an Ahmedabad-sized
            // (~42k/km²) reference.
            if (key === "population" && map.getLayer("population-heat")) {
              const max =
                (data as { properties?: { max_density?: number } }).properties?.max_density ?? 0;
              if (max > 0) {
                map.setPaintProperty("population-heat", "heatmap-weight", [
                  "interpolate", ["linear"], ["get", "density"], 0, 0, max, 1,
                ]);
              }
            }
          }
        } catch {
          // A failed layer must not take the whole map down.
        }
      })
    );
  }

  // ---- reactive updates ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    const has = (k: LayerKey) => props.layers.includes(k);
    vis("boundary-fill", has("boundary"));
    vis("boundary-line", has("boundary"));
    vis("ward-fill", has("wards"));
    vis("ward-line", has("wards"));
    vis("population-heat", has("population"));
    vis("conflict-halo", has("conflicts"));
    vis("prediction-fill", has("prediction"));
    vis("parcel-fill", has("parcels"));
    vis("parcel-line", has("parcels"));
    vis("road-line", has("roads"));
    vis("river-line", has("roads"));
    vis("facility-circle", has("facilities"));
  }, [props.layers, ready]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("parcel-fill")) return;
    if (props.builtYear) {
      map.setPaintProperty("parcel-fill", "fill-color", [
        "interpolate", ["linear"], ["coalesce", ["get", `h${props.builtYear}`], 0],
        0, "#0b2233", 20, "#0ea5e9", 45, "#eab308", 70, "#f97316", 100, "#ef4444",
      ] as ExpressionSpecification);
    } else {
      map.setPaintProperty("parcel-fill", "fill-color", parcelFillColor(props.parcelColorMode ?? "ownership"));
    }
  }, [props.parcelColorMode, props.builtYear, ready]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("ward-fill")) return;
    const m = props.wardMetric ?? "none";
    map.setPaintProperty("ward-fill", "fill-color", wardColor(m));
    map.setPaintProperty("ward-fill", "fill-opacity", m === "none" ? 0 : 0.42);
  }, [props.wardMetric, ready]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("facility-circle")) return;
    if (props.facilityTypes && props.facilityTypes.length)
      map.setFilter("facility-circle", ["in", ["get", "facility_type"], ["literal", props.facilityTypes]]);
    else map.setFilter("facility-circle", null);
  }, [props.facilityTypes, ready]);

  // parcel filter → reload parcel data
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !props.layers.includes("parcels")) return;
    loadGeo(props.parcelFilter ? parcelUrl(props.parcelFilter) : "parcels").then((data) => {
      (map.getSource("parcels") as maplibregl.GeoJSONSource)?.setData(data);
    });
  }, [props.parcelFilter?.ownership, props.parcelFilter?.vacantOnly, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // selection feature-state
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (selectedRef.current)
      map.setFeatureState({ source: "parcels", id: selectedRef.current }, { selected: false });
    selectedRef.current = props.selectedParcelId ?? null;
    if (selectedRef.current)
      map.setFeatureState({ source: "parcels", id: selectedRef.current }, { selected: true });
  }, [props.selectedParcelId, ready]);

  // highlight feature-state
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of highlightRef.current)
      map.setFeatureState({ source: "parcels", id }, { highlight: false });
    highlightRef.current = props.highlightParcelIds ?? [];
    for (const id of highlightRef.current)
      map.setFeatureState({ source: "parcels", id }, { highlight: true });
  }, [props.highlightParcelIds, ready]);

  // markers (proposed sites / result pins)
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const mk of props.markers ?? []) {
      const el = document.createElement("div");
      const c = mk.color ?? "#38bdf8";
      if (mk.text) {
        el.textContent = mk.text;
        el.style.cssText = `width:22px;height:22px;border-radius:50%;background:${c};border:2px solid #0b1220;box-shadow:0 0 0 3px ${c}44;cursor:pointer;color:#0b1220;font:700 12px/22px var(--font-sans);text-align:center;`;
      } else {
        el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #0b1220;box-shadow:0 0 0 3px ${c}55;cursor:pointer;`;
      }
      if (mk.pulse) el.className = "pulse";
      const marker = new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]);
      if (mk.label)
        marker.setPopup(new maplibregl.Popup({ closeButton: false, offset: 14 }).setHTML(`<div style="font-size:12px;font-weight:600">${mk.label}</div>`));
      marker.addTo(map);
      markersRef.current.push(marker);
    }
  }, [props.markers]);

  // fly to focus
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.focus) return;
    map.flyTo({ center: [props.focus.lng, props.focus.lat], zoom: props.focus.zoom ?? 13.5, duration: 1200, essential: true });
  }, [props.focus]);

  return <div ref={containerRef} className={props.className ?? "w-full h-full"} />;
}

function wardColor(metric: WardMetric): ExpressionSpecification | string {
  if (metric === "infrastructure")
    return ["interpolate", ["linear"], ["coalesce", ["get", "infrastructure_score"], 50], 20, "#ef4444", 45, "#f97316", 60, "#eab308", 80, "#22c55e"];
  if (metric === "livability")
    return ["interpolate", ["linear"], ["coalesce", ["get", "livability_score"], 50], 40, "#ef4444", 55, "#f97316", 68, "#eab308", 82, "#22c55e"];
  if (metric === "population")
    return ["interpolate", ["linear"], ["coalesce", ["get", "population_density"], 0], 2000, "#0b2233", 10000, "#0ea5e9", 20000, "#a855f7"];
  return "#000000";
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function parcelUrl(filter: { ownership?: string; vacantOnly?: boolean }): string {
  const p = new URLSearchParams();
  if (filter.ownership) p.set("ownership", filter.ownership);
  if (filter.vacantOnly) p.set("vacant", "true");
  const qs = p.toString();
  return "/api/parcels" + (qs ? `?${qs}` : "");
}
