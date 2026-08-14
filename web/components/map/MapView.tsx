"use client";

import dynamic from "next/dynamic";
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

export function MapView(props: CityMapProps) {
  return <CityMap {...props} />;
}

export type { CityMapProps, LayerKey, ParcelColorMode, WardMetric, MapMarker } from "./CityMap";
