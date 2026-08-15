"use client";
import * as THREE from "three";
import { outerHaloFragmentShader, atmosphereVertexShader } from "@/shaders/atmosphereShader";

/**
 * GlowHalo — larger outer corona sphere for the "glow from space" effect.
 */
export default function GlowHalo() {
  return (
    <mesh scale={[1.22, 1.22, 1.22]}>
      <sphereGeometry args={[2.5, 32, 32]} />
      <shaderMaterial
        vertexShader={atmosphereVertexShader}
        fragmentShader={outerHaloFragmentShader}
        uniforms={{
          glowColor: { value: new THREE.Color(0x1a6fa8) },
          glowIntensity: { value: 1.2 },
        }}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
