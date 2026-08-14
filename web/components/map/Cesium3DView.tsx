"use client";

import dynamic from "next/dynamic";
import type { Cesium3DProps } from "./Cesium3D";

const Cesium3D = dynamic(() => import("./Cesium3D").then((m) => m.Cesium3D), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg)]">
      <div className="flex items-center gap-2 text-muted text-sm">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)] animate-spin" />
        Initialising 3D globe…
      </div>
    </div>
  ),
});

export function Cesium3DView(props: Cesium3DProps) {
  return <Cesium3D {...props} />;
}

export type { Cesium3DProps } from "./Cesium3D";
