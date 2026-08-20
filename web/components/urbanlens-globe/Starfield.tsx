"use client";

import { useMemo } from "react";
import * as THREE from "three";

export interface StarfieldProps {
  count?: number;
  radius?: number;
}

/** A quiet star field — deliberately sparse, never a particle storm. */
export default function Starfield({ count = 1200, radius = 34 }: StarfieldProps) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    let seed = 90210;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const theta = rnd() * Math.PI * 2;
      const r = radius * (0.75 + rnd() * 0.5);
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      alpha[i] = 0.25 + rnd() * 0.75;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    return g;
  }, [count, radius]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uSize: { value: 1.6 } },
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          varying float vAlpha;
          uniform float uSize;
          void main() {
            vAlpha = aAlpha;
            gl_PointSize = uSize;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            gl_FragColor = vec4(0.82, 0.90, 1.0, vAlpha * 0.85);
          }
        `,
      }),
    []
  );

  return <points geometry={geometry} material={material} />;
}
