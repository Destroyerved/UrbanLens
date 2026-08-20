"use client";
import { useRef, useEffect, MutableRefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * useGlobeControls
 * Scoped pointer-event drag handler for the globe mesh.
 * Rotates the globe on drag with smooth inertia on release.
 * Distinguishes click from drag via distance threshold to avoid triggering enters.
 */
export function useGlobeControls(meshRef: MutableRefObject<THREE.Group | null>) {
  const { gl, camera } = useThree();
  const isDragging = useRef(false);
  const wasJustDragging = useRef(false);
  const previousPointer = useRef({ x: 0, y: 0 });
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const velocity = useRef({ x: 0, y: 0 });
  const raycaster = useRef(new THREE.Raycaster()).current;

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      if (meshRef.current) {
        const intersects = raycaster.intersectObject(meshRef.current, true);
        if (intersects.length === 0) return;
      }

      isDragging.current = true;
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      previousPointer.current = { x: e.clientX, y: e.clientY };
      hasMovedRef.current = false;
      velocity.current = { x: 0, y: 0 };
      document.body.style.cursor = "grabbing";

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current || !meshRef.current) return;

      const dx = e.clientX - previousPointer.current.x;
      const dy = e.clientY - previousPointer.current.y;
      previousPointer.current = { x: e.clientX, y: e.clientY };

      const totalDist = Math.hypot(e.clientX - pointerDownPos.current.x, e.clientY - pointerDownPos.current.y);
      if (totalDist > 8) {
        hasMovedRef.current = true;
      }

      const sensitivity = 0.0045;
      const qY = new THREE.Quaternion();
      const qX = new THREE.Quaternion();
      qY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * sensitivity);
      qX.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -dy * sensitivity);

      meshRef.current.quaternion.premultiply(qY);
      meshRef.current.quaternion.premultiply(qX);

      velocity.current = {
        x: -dx * sensitivity * 0.6,
        y: -dy * sensitivity * 0.6,
      };
    };

    const onPointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "auto";

        if (hasMovedRef.current) {
          wasJustDragging.current = true;
          setTimeout(() => {
            wasJustDragging.current = false;
          }, 50);
        }
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    canvas.addEventListener("pointerdown", onPointerDown as EventListener);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown as EventListener);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "auto";
    };
  }, [gl, camera, meshRef, raycaster]);

  /** Call this in useFrame to apply inertia decay each frame. */
  const applyInertia = () => {
    if (!isDragging.current && meshRef.current) {
      const damping = 0.95;
      velocity.current.x *= damping;
      velocity.current.y *= damping;

      if (Math.abs(velocity.current.x) > 0.0001 || Math.abs(velocity.current.y) > 0.0001) {
        const qY = new THREE.Quaternion();
        const qX = new THREE.Quaternion();
        qY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), velocity.current.x);
        qX.setFromAxisAngle(new THREE.Vector3(1, 0, 0), velocity.current.y);
        meshRef.current.quaternion.premultiply(qY);
        meshRef.current.quaternion.premultiply(qX);
      }
    }
  };

  return { isDragging, applyInertia, wasJustDragging };
}
