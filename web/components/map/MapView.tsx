"use client";

import dynamic from "next/dynamic";
import { useCity } from "@/components/shell/CityProvider";
import type { CityMapProps } from "./CityMap";

const CityMap = dynamic(() => import("./CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg)]">
      <div className="flex items-center gap-2 text-muted text-sm">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)] animate-spin" />
        Loading spatial layers…
      </div>
    </div>
  ),
});

/**
 * Wraps the map with the active city's view, so pages never hard-code a centre.
 * The whole page subtree is remounted on a city change (see the app layout), so
 * the map re-initialises against the new city automatically.
 */
export function MapView(props: CityMapProps) {
  const { city } = useCity();
  return <CityMap center={city.center} zoom={city.zoom} {...props} />;
}

export type { CityMapProps, LayerKey, ParcelColorMode, WardMetric, MapMarker } from "./CityMap";
