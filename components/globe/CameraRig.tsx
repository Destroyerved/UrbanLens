"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraRigProps {
  isZoomed: boolean;
}

/**
 * CameraRig — smoothly interpolates camera position and FOV based on zoom state.
 * On zoom-in, the camera plunges close to the cloud layer with a wider FOV so it
 * fills the full viewport with an immersive atmosphere rather than a cropped patch.
 */
export default function CameraRig({ isZoomed }: CameraRigProps) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3(0, 0, 8.5));
  // z=3.2 keeps the camera just outside the cloud sphere (r=2.52) with comfortable margin
  const zoomedPos = useRef(new THREE.Vector3(0, 0, 3.2));

  useFrame((_, delta) => {
    const target = isZoomed ? zoomedPos.current : startPos.current;
    const targetFov = isZoomed ? 60 : 45;

    // Cinematic smooth dampening — like a GSAP ease
    camera.position.lerp(target, 4.0 * delta);

    // Smoothly animate FOV alongside position
    if ("fov" in camera) {
      const perspCam = camera as THREE.PerspectiveCamera;
      perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetFov, 4.0 * delta);
      perspCam.updateProjectionMatrix();
    }

    // Always look at world-space origin — the globe's actual centre
    camera.lookAt(0, 0, 0);
  });

  return null;
}
