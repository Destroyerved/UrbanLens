"use client";
import * as THREE from "three";
import { useTextures } from "@/hooks/useTextures";

/**
 * EarthMesh — photorealistic PBR sphere with day texture, normal map and specular.
 */
export default function EarthMesh() {
  const { dayMap, normalMap, specularMap } = useTextures();

  return (
    <mesh>
      <sphereGeometry args={[2.5, 64, 64]} />
      <meshStandardMaterial
        map={dayMap}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.05, 0.05)}
        roughnessMap={specularMap}
        roughness={0.4}
        metalnessMap={specularMap}
        metalness={0.1}
      />
    </mesh>
  );
}
