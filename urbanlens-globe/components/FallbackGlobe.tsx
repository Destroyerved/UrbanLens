"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../lib/scroll";
import { evalCamera } from "../lib/story";
import { createFallbackMaterial, createAtmosphereMaterial } from "./materials";

/**
 * Graceful degradation: if NASA textures fail to load, we still render a
 * lit, atmospheric planet — never a black sphere.
 */
export default function FallbackGlobe() {
  const mat = useMemo(() => createFallbackMaterial(), []);
  const atmo = useMemo(() => createAtmosphereMaterial(), []);
  const wrapper = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const cur = useRef({ p: 0 });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    cur.current.p += (scrollState.progress - cur.current.p) * (1 - Math.exp(-dt * 4.2));
    const k = evalCamera(cur.current.p);
    const t = state.clock.elapsedTime;
    const lon = k.lon + (scrollState.reduced ? 0 : (k.idle || (scrollState.autoRotate ? 1 : 0)) * t * -1.15 * scrollState.rotationSpeed);
    inner.current.rotation.x = THREE.MathUtils.degToRad(k.lat);
    inner.current.rotation.y = -Math.PI / 2 - THREE.MathUtils.degToRad(lon);
    state.camera.position.z += (k.dist - state.camera.position.z) * (1 - Math.exp(-dt * 3.2));
    wrapper.current.position.x += (k.ox - wrapper.current.position.x) * (1 - Math.exp(-dt * 3.2));
    wrapper.current.position.y += (k.oy - wrapper.current.position.y) * (1 - Math.exp(-dt * 3.2));
    wrapper.current.scale.setScalar(0.94 + 0.06 * scrollState.intro);
  });

  return (
    <group ref={wrapper}>
      <group rotation-z={-0.06}>
        <group ref={inner}>
          <mesh material={mat}>
            <sphereGeometry args={[1, 64, 64]} />
          </mesh>
        </group>
        <mesh material={atmo}>
          <sphereGeometry args={[1.075, 48, 48]} />
        </mesh>
      </group>
    </group>
  );
}
