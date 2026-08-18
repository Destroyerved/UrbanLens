"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CITIES, GUJARAT_CENTER, latLonToVec3, type City } from "../lib/geo";
import { scrollState } from "../lib/scroll";

const Z = new THREE.Vector3(0, 0, 1);

export type CityMarkersProps = {
  cities?: City[];
  accentColor?: string;
  forceVisible?: boolean;
};

export default function CityMarkers({
  cities = CITIES,
  accentColor = "#16D9F5",
  forceVisible = false,
}: CityMarkersProps) {
  const group = useRef<THREE.Group>(null!);
  const ringMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const ringMeshes = useRef<THREE.Mesh[]>([]);
  const labelEls = useRef<(HTMLDivElement | null)[]>([]);
  const scanMat = useRef<THREE.MeshBasicMaterial>(null!);
  const scanMesh = useRef<THREE.Mesh>(null!);

  const dotMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [accentColor]
  );

  const markers = useMemo(
    () =>
      cities.map((c) => {
        const pos = latLonToVec3(c.lat, c.lon, 1.006);
        const q = new THREE.Quaternion().setFromUnitVectors(Z, pos.clone().normalize());
        return { ...c, pos, q };
      }),
    [cities]
  );

  const scan = useMemo(() => {
    const pos = latLonToVec3(GUJARAT_CENTER.lat, GUJARAT_CENTER.lon, 1.005);
    const q = new THREE.Quaternion().setFromUnitVectors(Z, pos.clone().normalize());
    return { pos, q };
  }, []);

  useFrame((state) => {
    const o = forceVisible ? 1 : scrollState.markers;
    group.current.visible = o > 0.01;
    if (!group.current.visible) return;

    dotMat.opacity = o;
    const t = state.clock.elapsedTime;

    ringMeshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const ph = (t * 0.42 + i * 0.21) % 1;
      mesh.scale.setScalar(1 + ph * 2.4);
      const m = ringMats.current[i];
      if (m) m.opacity = (1 - ph) * (1 - ph) * 0.4 * o;
    });

    // Slow scan pulse across the state region
    if (scanMesh.current && scanMat.current) {
      const sp = (t * 0.3) % 1;
      scanMesh.current.scale.setScalar(0.7 + sp * 1.1);
      scanMat.current.opacity = (1 - sp) * 0.16 * o;
    }

    labelEls.current.forEach((el) => {
      if (el) el.style.opacity = String(o);
    });
  });

  return (
    <group ref={group} visible={false}>
      {markers.map((m, i) => (
        <group key={m.name} position={m.pos} quaternion={m.q}>
          <mesh material={dotMat}>
            <circleGeometry args={[m.major ? 0.0075 : 0.0055, 24]} />
          </mesh>
          <mesh
            ref={(el) => {
              if (el) ringMeshes.current[i] = el;
            }}
          >
            <ringGeometry args={[0.0105, 0.012, 32]} />
            <meshBasicMaterial
              ref={(el) => {
                if (el) ringMats.current[i] = el;
              }}
              color={accentColor}
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <Html center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
            <div
              ref={(el) => {
                labelEls.current[i] = el;
              }}
              className={`city-label${m.major ? " city-label--major" : ""}`}
              style={{
                opacity: 0,
                transform: `translate(${m.dx * 16}px, ${m.dy * 16 - 14}px)`,
              }}
            >
              {m.name}
            </div>
          </Html>
        </group>
      ))}

      <group position={scan.pos} quaternion={scan.q}>
        <mesh ref={scanMesh}>
          <ringGeometry args={[0.085, 0.0865, 48]} />
          <meshBasicMaterial
            ref={scanMat}
            color={accentColor}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}
