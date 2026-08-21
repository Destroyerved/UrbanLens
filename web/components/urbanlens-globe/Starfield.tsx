"use client";

import { useMemo } from "react";
import * as THREE from "three";

export interface StarfieldProps {
  count?: number;
  radius?: number;
}

/** A quiet star field — deliberately sparse, never a particle storm. */
export default function Starfield({ count = 2200, radius = 42 }: StarfieldProps) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    let seed = 90210;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const theta = rnd() * Math.PI * 2;
      const r = radius * (0.65 + rnd() * 0.7);
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      alpha[i] = 0.35 + rnd() * 0.65;

      // Subtle celestial color temperature
      const temp = rnd();
      if (temp > 0.8) {
        // warm gold
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.88;
        colors[i * 3 + 2] = 0.72;
      } else if (temp > 0.5) {
        // cyan / blue-white
        colors[i * 3] = 0.72;
        colors[i * 3 + 1] = 0.92;
        colors[i * 3 + 2] = 1.0;
      } else {
        // pure white
        colors[i * 3] = 0.95;
        colors[i * 3 + 1] = 0.97;
        colors[i * 3 + 2] = 1.0;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    return g;
  }, [count, radius]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uSize: { value: 1.8 } },
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          attribute vec3 aColor;
          varying float vAlpha;
          varying vec3 vColor;
          uniform float uSize;
          void main() {
            vAlpha = aAlpha;
            vColor = aColor;
            gl_PointSize = uSize * (0.8 + 0.5 * aAlpha);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec2 pt = gl_PointCoord - vec2(0.5);
            float dist = length(pt);
            if (dist > 0.5) discard;
            float soft = smoothstep(0.5, 0.05, dist);
            gl_FragColor = vec4(vColor, vAlpha * soft * 0.9);
          }
        `,
      }),
    []
  );

  return <points geometry={geometry} material={material} />;
}
