"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTextures } from "@/hooks/useTextures";
import * as THREE from "three";

/**
 * CloudLayer — slightly larger independent sphere with alpha-blended cloud texture.
 * Rotates independently from the Earth for a realistic atmospheric effect.
 */
export default function CloudLayer() {
  const cloudsRef = useRef<THREE.Mesh>(null);
  const { cloudsMap } = useTextures();

  useFrame(() => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += 0.001;
      cloudsRef.current.rotation.z += 0.0001;
    }
  });

  if (!cloudsMap) return null;

  return (
    <mesh ref={cloudsRef}>
      {/* Slightly larger than Earth radius (2.5) */}
      <sphereGeometry args={[2.52, 64, 64]} />
      <meshStandardMaterial
        map={cloudsMap}
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
