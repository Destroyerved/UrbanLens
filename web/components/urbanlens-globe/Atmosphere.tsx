"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { atmosphereFragment, atmosphereVertex } from "./shaders/atmosphere";

export interface AtmosphereProps {
  sunDirection: THREE.Vector3;
  color?: string;
  intensity?: number;
  /** radius multiplier — kept close to the surface so it reads as air, not a shell */
  scale?: number;
}

export default function Atmosphere({
  sunDirection,
  color = "#60A5FA",
  intensity = 1.45,
  scale = 1.058,
}: AtmosphereProps) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uSunDirection: { value: sunDirection },
      uIntensity: { value: intensity },
    }),
    [color, sunDirection, intensity]
  );

  return (
    <mesh renderOrder={2}>
      <sphereGeometry args={[scale, 128, 128]} />
      <shaderMaterial
        vertexShader={atmosphereVertex}
        fragmentShader={atmosphereFragment}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
