"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { scrollState, smooth } from "./lib/scroll";
import { evalCamera } from "./lib/story";
import {
  createEarthMaterial,
  createCloudsMaterial,
  createAtmosphereMaterial,
} from "./materials";
import CityMarkers from "./CityMarkers";
import GujaratOutline from "./GujaratOutline";

const DAMP = (cur: number, target: number, dt: number, k: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt * k));

export type GlobeProps = {
  mobile?: boolean;
  textureBasePath?: string;
  showMarkers?: boolean;
  showOutline?: boolean;
  forceMarkersVisible?: boolean;
  autoRotate?: boolean;
  rotationSpeed?: number;
};

export default function Globe({
  mobile = false,
  textureBasePath = "/textures",
  showMarkers = true,
  showOutline = true,
  forceMarkersVisible = false,
  autoRotate = false,
  rotationSpeed = 1,
}: GlobeProps) {
  const base = textureBasePath.replace(/\/$/, "");
  const paths = mobile
    ? [
        `${base}/earth-day-2k.webp`,
        `${base}/earth-night-1k.webp`,
        `${base}/earth-ocean-1k.webp`,
        `${base}/earth-clouds-1k.webp`,
      ]
    : [
        `${base}/earth-day-4k.webp`,
        `${base}/earth-night-2k.webp`,
        `${base}/earth-ocean-2k.webp`,
        `${base}/earth-clouds-2k.webp`,
      ];

  const [day, night, ocean, clouds] = useLoader(THREE.TextureLoader, paths);
  const { gl } = useThree();

  useMemo(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    clouds.colorSpace = THREE.SRGBColorSpace;
    [day, night, ocean, clouds].forEach((t) => {
      t.anisotropy = aniso;
      t.needsUpdate = true;
    });
  }, [day, night, ocean, clouds, gl]);

  const earthMat = useMemo(() => createEarthMaterial(day, night, ocean), [day, night, ocean]);
  const cloudsMat = useMemo(() => createCloudsMaterial(clouds), [clouds]);
  const atmoMat = useMemo(() => createAtmosphereMaterial(), []);

  const wrapper = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const cloudsRef = useRef<THREE.Mesh>(null!);
  const cur = useRef({ p: 0 });

  const seg = mobile ? 64 : 96;

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;

    // Cinematic damping toward the scrubbed story progress
    cur.current.p = DAMP(cur.current.p, scrollState.progress, dt, 4.2);
    const p = cur.current.p;
    const k = evalCamera(p);

    // Idle drift while in orbit / autoRotate
    const effectiveIdle = autoRotate ? 1 : k.idle;
    const speed = rotationSpeed ?? scrollState.rotationSpeed ?? 1;
    const idleLon = scrollState.reduced ? 0 : effectiveIdle * t * -1.15 * speed;
    const lat = k.lat;
    const lon = k.lon + idleLon;

    inner.current.rotation.x = THREE.MathUtils.degToRad(lat);
    inner.current.rotation.y = -Math.PI / 2 - THREE.MathUtils.degToRad(lon);

    const distMul = mobile ? 1.32 : 1;
    state.camera.position.z = DAMP(state.camera.position.z, k.dist * distMul, dt, 3.2);

    const ox = k.ox * (mobile ? 0.35 : 1);
    const oy = k.oy + (mobile ? 0.12 : 0);
    wrapper.current.position.x = DAMP(wrapper.current.position.x, ox, dt, 3.2);
    wrapper.current.position.y = DAMP(wrapper.current.position.y, oy, dt, 3.2);

    // Entrance scale transition
    const s = 0.94 + 0.06 * scrollState.intro;
    wrapper.current.scale.setScalar(s);

    // Cloud layer independent drift
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y = t * 0.0055 * speed;
    }

    // Marker visibility calculation
    if (!forceMarkersVisible) {
      scrollState.markers = smooth(0.66, 0.745, p) * (1 - smooth(0.93, 1, p));
    }
  });

  return (
    <group ref={wrapper}>
      <group rotation-z={-0.06}>
        <group ref={inner}>
          <mesh material={earthMat}>
            <sphereGeometry args={[1, seg, seg]} />
          </mesh>
          <mesh ref={cloudsRef} material={cloudsMat}>
            <sphereGeometry args={[1.012, seg, seg]} />
          </mesh>
          {showMarkers && <CityMarkers forceVisible={forceMarkersVisible} />}
          {showOutline && <GujaratOutline forceVisible={forceMarkersVisible} />}
        </group>
        <mesh material={atmoMat}>
          <sphereGeometry args={[1.075, 64, 64]} />
        </mesh>
      </group>
    </group>
  );
}
