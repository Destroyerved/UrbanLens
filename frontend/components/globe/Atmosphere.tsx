"use client";
import { atmosphereVertexShader, atmosphereFragmentShader } from "@/shaders/atmosphereShader";
import * as THREE from "three";

/**
 * Atmosphere — tight Fresnel limb glow only.
 * Scale reduced to 1.025 so the glow hugs the actual sphere edge
 * (matches real NASA Earth photos — thin blue haze at the horizon, no separate ring).
 * Intensity reduced so it reads as a haze, not a bright artificial rim-light.
 */
export default function Atmosphere() {
  return (
    <mesh scale={[1.025, 1.025, 1.025]}>
      <sphereGeometry args={[2.5, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragmentShader}
        uniforms={{
          glowColor: { value: new THREE.Color(0x4dc8ff) },
          glowIntensity: { value: 0.7 },   // was 1.6 — much subtler
        }}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
