"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { earthFragment, earthVertex } from "./shaders/earth";
import type { EarthTextures } from "./lib/textures";
import { layersForProgress } from "./lib/stage";
import { globeState } from "./lib/store";

export interface EarthProps {
  textures: EarthTextures;
  sunDirection: THREE.Vector3;
  segments?: number;
  rimColor?: string;
  scanColor?: string;
}

export default function Earth({
  textures,
  sunDirection,
  segments = 128,
  rimColor = "#7ABEFF",
  scanColor = "#16D9F5",
}: EarthProps) {
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uDay: { value: textures.day },
      uNight: { value: textures.night },
      uOcean: { value: textures.ocean },
      uSunDirection: { value: sunDirection },
      uRimColor: { value: new THREE.Color(rimColor) },
      uNightIntensity: { value: textures.usingAssets ? 1.35 : 1.15 },
      uExposure: { value: textures.usingAssets ? 1.08 : 1.18 },
      uRimStrength: { value: 1.15 },
      uScanY: { value: 0.5 },
      uScanAmount: { value: 0 },
      uScanColor: { value: new THREE.Color(scanColor) },
    }),
    [textures, sunDirection, rimColor, scanColor]
  );

  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    const layers = layersForProgress(globeState.progress);
    m.uniforms.uScanAmount.value = globeState.reducedMotion ? 0 : layers.scan;
    m.uniforms.uScanY.value = (clock.elapsedTime / 9) % 1;
  });

  return (
    <mesh renderOrder={0}>
      <sphereGeometry args={[1, segments, segments]} />
      <shaderMaterial
        ref={material}
        vertexShader={earthVertex}
        fragmentShader={earthFragment}
        uniforms={uniforms}
      />
    </mesh>
  );
}
