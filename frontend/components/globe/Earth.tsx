"use client";
import { useRef, useState, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useGlobeControls } from "@/hooks/useGlobeControls";
import EarthMesh from "./EarthMesh";
import CloudLayer from "./CloudLayer";
import Atmosphere from "./Atmosphere";
import GlobePlaceholder from "./GlobePlaceholder";
import * as THREE from "three";

interface EarthProps {
  onClick?: () => void;
}

/**
 * Earth — clean sphere: EarthMesh + CloudLayer + tight Atmosphere limb.
 * GlowHalo removed (was the oversized ring halo).
 */
export default function Earth({ onClick }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { applyInertia, isDragging, wasJustDragging } = useGlobeControls(groupRef);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    applyInertia();
    if (!isDragging.current && groupRef.current) {
      const baseDrift = 0.05;
      const hoverMultiplier = hovered ? 1.4 : 1.0;
      
      const driftQ = new THREE.Quaternion();
      driftQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseDrift * delta * hoverMultiplier);
      groupRef.current.quaternion.premultiply(driftQ);
    }
  });

  const handlePointerOver = (e: THREE.Event) => {
    (e as any).stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    setHovered(false);
    if (!isDragging.current) document.body.style.cursor = "auto";
  };

  return (
    <group
      ref={groupRef}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={(e) => {
        (e as any).stopPropagation();
        if (!isDragging.current && !wasJustDragging.current) onClick?.();
      }}
    >
      <Suspense fallback={<GlobePlaceholder />}>
        <EarthMesh />
        <CloudLayer />
        <Atmosphere />
        {/* GlowHalo intentionally removed — was the oversized artificial ring */}
      </Suspense>
    </group>
  );
}
