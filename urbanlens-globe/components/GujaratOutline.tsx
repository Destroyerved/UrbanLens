"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { latLonToVec3 } from "../lib/geo";
import { scrollState } from "../lib/scroll";

export type GujaratOutlineProps = {
  geoJsonUrl?: string;
  accentColor?: string;
  forceVisible?: boolean;
};

export default function GujaratOutline({
  geoJsonUrl = "/geo/gujarat.json",
  accentColor = "#16D9F5",
  forceVisible = false,
}: GujaratOutlineProps) {
  const [rings, setRings] = useState<THREE.BufferGeometry[] | null>(null);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [accentColor]
  );

  useEffect(() => {
    let alive = true;
    fetch(geoJsonUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.rings) return;
        const geos = (d.rings as number[][][]).map((ring) => {
          const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, 1.006));
          return new THREE.BufferGeometry().setFromPoints(pts);
        });
        setRings(geos);
      })
      .catch(() => {
        /* outline is decorative — fail silently */
      });
    return () => {
      alive = false;
    };
  }, [geoJsonUrl]);

  useFrame(() => {
    mat.opacity = (forceVisible ? 1 : scrollState.markers) * 0.45;
  });

  if (!rings) return null;

  return (
    <group>
      {rings.map((g, i) => (
        <lineLoop key={i} geometry={g} material={mat} />
      ))}
    </group>
  );
}
