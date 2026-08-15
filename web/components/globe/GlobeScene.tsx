"use client";
import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import Earth from "./Earth";
import Stars from "./Stars";
import Lights from "./Lights";
import CameraRig from "./CameraRig";
import GlobeErrorBoundary from "./GlobeErrorBoundary";

interface GlobeSceneProps {
  isZoomed: boolean;
  /** Called when the globe is clicked — parent handles the full-screen transition */
  setIsZoomed: (() => void) | ((v: boolean) => void);
}

/**
 * GlobeScene — the full Three.js/R3F canvas.
 * Vignette is handled via CSS overlay (avoids postprocessing peer dep issues with Next 14).
 */
export default function GlobeScene({ isZoomed, setIsZoomed }: GlobeSceneProps) {
  const glRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      try {
        if (glRef.current) {
          if (typeof glRef.current.dispose === "function") glRef.current.dispose();
          if (typeof glRef.current.forceContextLoss === "function")
            glRef.current.forceContextLoss();
          if (glRef.current.domElement?.parentNode)
            glRef.current.domElement.remove();
        }
      } catch (err) {
        console.warn("[GlobeScene] Renderer cleanup (non-fatal):", err);
      }
    };
  }, []);

  return (
    <GlobeErrorBoundary>
      <Canvas
        camera={{ position: [0, 0, 8.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ background: "transparent", cursor: "pointer", touchAction: "none" }}
        onCreated={({ gl }) => {
          glRef.current = gl;
          (window as any).__threeRenderer = gl;
        }}
      >
        <CameraRig isZoomed={isZoomed} />
        <Lights />
        <Stars />

        {/* Globe centred in the canvas — CSS layout positions it right-of-centre */}
        <group position={[0, 0, 0]}>
          <Earth onClick={() => (setIsZoomed as () => void)()} />
        </group>
      </Canvas>
    </GlobeErrorBoundary>
  );
}
