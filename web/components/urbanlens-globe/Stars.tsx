"use client";

import { useMemo } from "react";
import * as THREE from "three";

export default function Stars() {
  const geo = useMemo(() => {
    const N = 1600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // uniform spherical distribution
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 45 + Math.random() * 45;
      pos[i * 3] = s * Math.cos(th) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(th) * r;
      // cool blue-white variance with subtle warm stars
      const warm = Math.random() < 0.08;
      const v = 0.55 + Math.random() * 0.45;
      if (warm) c.setRGB(v, v * 0.86, v * 0.7);
      else c.setRGB(v * 0.82, v * 0.9, v);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.11,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    []
  );

  return <points geometry={geo} material={mat} />;
}
