"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  cloudFragmentProcedural,
  cloudFragmentTextured,
  earthVertex,
} from "./shaders/earth";
import { globeState } from "./lib/store";

export interface CloudsProps {
  map: THREE.Texture | null;
  sunDirection: THREE.Vector3;
  opacity?: number;
  segments?: number;
  /** independent cloud drift, radians per second */
  driftSpeed?: number;
}

export default function Clouds({
  map,
  sunDirection,
  opacity = 0.85,
  segments = 128,
  driftSpeed = 0.007,
}: CloudsProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uClouds: { value: map },
      uSunDirection: { value: sunDirection },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
    }),
    [map, sunDirection, opacity]
  );

  useFrame((_, delta) => {
    if (material.current) material.current.uniforms.uTime.value += delta;
    // clouds rotate slightly faster than the surface, and stop when the
    // visitor has asked for reduced motion
    if (mesh.current && !globeState.reducedMotion) {
      mesh.current.rotation.y += delta * driftSpeed;
    }
  });

  return (
    <mesh ref={mesh} renderOrder={1}>
      <sphereGeometry args={[1.012, segments, segments]} />
      <shaderMaterial
        ref={material}
        vertexShader={earthVertex}
        fragmentShader={map ? cloudFragmentTextured : cloudFragmentProcedural}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
