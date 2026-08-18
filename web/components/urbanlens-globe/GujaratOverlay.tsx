"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GUJARAT_OUTLINE } from "./data/gujaratOutline";
import { GUJARAT_CENTER, INDIA_CENTER } from "./data/gujaratCities";
import { latLngToVec3, sphereRibbon } from "./lib/geo";
import { layersForProgress } from "./lib/stage";
import { globeState } from "./lib/store";

export interface GujaratOverlayProps {
  accent?: string;
  /** draw the light geospatial grid over the state */
  showGrid?: boolean;
}

/**
 * The state highlight: a thin outline, a soft glow beneath it, a slow location
 * pulse and an optional analysis grid. Everything is opacity-driven from the
 * scroll timeline so nothing pops in.
 */
export default function GujaratOverlay({
  accent = "#16D9F5",
  showGrid = true,
}: GujaratOverlayProps) {
  const group = useRef<THREE.Group>(null);
  const outlineRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const gridRef = useRef<THREE.LineSegments>(null);
  const indiaRef = useRef<THREE.Mesh>(null);

  // the boundary is drawn as two sphere-hugging ribbons: a wide soft halo
  // under a thin bright edge
  const outlineGeometry = useMemo(() => sphereRibbon(GUJARAT_OUTLINE, 0.0035, 1.0045), []);
  const haloGeometry = useMemo(() => sphereRibbon(GUJARAT_OUTLINE, 0.016, 1.0035), []);

  useEffect(
    () => () => {
      outlineGeometry.dispose();
      haloGeometry.dispose();
    },
    [outlineGeometry, haloGeometry]
  );

  const glowPosition = useMemo(
    () => latLngToVec3(GUJARAT_CENTER[1], GUJARAT_CENTER[0], 1.002),
    []
  );
  const indiaPosition = useMemo(
    () => latLngToVec3(INDIA_CENTER[1], INDIA_CENTER[0], 1.002),
    []
  );

  /** a small graticule patch clipped to the Gujarat bounding box */
  const gridGeometry = useMemo(() => {
    const pts: number[] = [];
    const step = 0.5;
    for (let lng = 68.5; lng <= 74.5; lng += step) {
      for (let lat = 20; lat < 24.5; lat += 0.25) {
        const a = latLngToVec3(lat, lng, 1.003);
        const b = latLngToVec3(lat + 0.25, lng, 1.003);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let lat = 20; lat <= 24.5; lat += step) {
      for (let lng = 68.5; lng < 74.5; lng += 0.25) {
        const a = latLngToVec3(lat, lng, 1.003);
        const b = latLngToVec3(lat, lng + 0.25, 1.003);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  useFrame(({ clock }) => {
    const layers = layersForProgress(globeState.progress);
    const t = clock.elapsedTime;

    const setOpacity = (o: THREE.Object3D | null, value: number) => {
      if (!o) return;
      const mat = (o as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (mat) mat.opacity = value;
      o.visible = value > 0.005;
    };

    setOpacity(outlineRef.current, layers.gujaratOutline * 0.95);
    setOpacity(haloRef.current, layers.gujaratOutline * 0.22);
    setOpacity(glowRef.current, layers.gujaratGlow * 0.09);
    setOpacity(indiaRef.current, layers.indiaGlow * 0.1);
    setOpacity(gridRef.current, showGrid ? layers.grid * 0.11 : 0);

    if (pulseRef.current) {
      const phase = globeState.reducedMotion ? 0.35 : (t / 3) % 1;
      pulseRef.current.scale.setScalar(0.55 + phase * 2.1);
      setOpacity(pulseRef.current, layers.gujaratGlow * (1 - phase) * 0.5);
    }
  });

  return (
    <group ref={group}>
      {/* soft glow discs — India first, then the state */}
      <mesh
        ref={indiaRef}
        position={indiaPosition}
        onUpdate={(self) => self.lookAt(indiaPosition.clone().multiplyScalar(2))}
        visible={false}
      >
        <circleGeometry args={[0.16, 48]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        ref={glowRef}
        position={glowPosition}
        onUpdate={(self) => self.lookAt(glowPosition.clone().multiplyScalar(2))}
        visible={false}
      >
        <circleGeometry args={[0.042, 40]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        ref={pulseRef}
        position={glowPosition}
        onUpdate={(self) => self.lookAt(glowPosition.clone().multiplyScalar(2))}
        visible={false}
      >
        <ringGeometry args={[0.032, 0.0345, 64]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* analysis grid over the state */}
      <lineSegments ref={gridRef} geometry={gridGeometry} visible={false}>
        <lineBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>

      {/* the boundary: a wide soft pass under a thin bright one */}
      <mesh ref={haloRef} geometry={haloGeometry} visible={false} renderOrder={3}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={outlineRef} geometry={outlineGeometry} visible={false} renderOrder={4}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
