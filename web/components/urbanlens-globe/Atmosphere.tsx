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
  color = "#7ABEFF",
  intensity = 1.15,
  scale = 1.055,
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
      <sphereGeometry args={[scale, 64, 32]} />
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
