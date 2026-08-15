"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraRigProps {
  isZoomed: boolean;
}

/**
 * CameraRig — smoothly interpolates camera position based on zoom state.
 * On zoom-in, the camera plunges into the cloud layer (the transition animation).
 */
export default function CameraRig({ isZoomed }: CameraRigProps) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3(0, 0, 8.5));
  const zoomedPos = useRef(new THREE.Vector3(2.0, 0, 2.7));

  useFrame((_, delta) => {
    const target = isZoomed ? zoomedPos.current : startPos.current;
    // Cinematic smooth dampening — like a GSAP ease
    camera.position.lerp(target, 4.0 * delta);
    camera.lookAt(target.x, target.y, 0);
  });

  return null;
}
