"use client";

import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import Globe, { type GlobeProps } from "./Globe";
import FallbackGlobe from "./FallbackGlobe";
import Stars from "./Stars";

class GlobeBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { err: boolean }
> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}

export type GlobeCanvasProps = GlobeProps & {
  onReady?: () => void;
  showStars?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function GlobeCanvas({
  onReady,
  showStars = true,
  className,
  style,
  ...globeProps
}: GlobeCanvasProps) {
  const [mobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

  return (
    <div className={className} style={{ width: "100%", height: "100%", ...style }}>
      <Canvas
        dpr={mobile ? [1, 1.5] : [1, 1.75]}
        camera={{ fov: 42, near: 0.1, far: 200, position: [0, 0, 3.55] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        {showStars && <Stars />}
        <GlobeBoundary
          fallback={
            <>
              <FallbackGlobe />
              <Ready onReady={onReady} />
            </>
          }
        >
          <Suspense fallback={null}>
            <Globe mobile={mobile} {...globeProps} />
            <Ready onReady={onReady} />
          </Suspense>
        </GlobeBoundary>
      </Canvas>
    </div>
  );
}
