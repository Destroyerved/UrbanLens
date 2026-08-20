"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GUJARAT_LINKS, cityById } from "./data/gujaratCities";
import { arcPoints } from "./lib/geo";
import { layersForProgress } from "./lib/stage";
import { globeState } from "./lib/store";

export interface CityLinksProps {
  accent?: string;
  /** peak opacity — keep this low; the links are a hint, not a network graph */
  maxOpacity?: number;
}

const VERT = /* glsl */ `
  attribute float aProgress;
  varying float vProgress;
  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uHead;
  varying float vProgress;

  void main() {
    // one slow, soft travelling segment along an otherwise faint line
    float d = abs(fract(vProgress - uHead + 1.0));
    float travel = smoothstep(0.16, 0.0, min(d, 1.0 - d));
    gl_FragColor = vec4(uColor, uOpacity * (0.32 + travel * 0.68));
  }
`;

/** Thin, low-opacity intelligence links between the primary urban nodes. */
export default function CityLinks({
  accent = "#16D9F5",
  maxOpacity = 0.34,
}: CityLinksProps) {
  const lines = useMemo(() => {
    const built: THREE.Line[] = [];

    for (const [a, b] of GUJARAT_LINKS) {
      const from = cityById(a);
      const to = cityById(b);
      if (!from || !to) continue;

      const points = arcPoints(from.coord, to.coord, 40, 0.05);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const progress = new Float32Array(points.length);
      points.forEach((_, i) => {
        progress[i] = i / (points.length - 1);
      });
      geometry.setAttribute("aProgress", new THREE.BufferAttribute(progress, 1));

      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(accent) },
          uOpacity: { value: 0 },
          uHead: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const line = new THREE.Line(geometry, material);
      line.visible = false;
      built.push(line);
    }

    return built;
  }, [accent]);

  const ref = useRef(lines);
  ref.current = lines;

  useEffect(() => {
    return () => {
      lines.forEach((l) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      });
    };
  }, [lines]);

  useFrame(({ clock }) => {
    const layers = layersForProgress(globeState.progress);
    const opacity = layers.links * maxOpacity;
    const head = globeState.reducedMotion ? 0.5 : (clock.elapsedTime * 0.09) % 1;

    ref.current.forEach((line, i) => {
      const material = line.material as THREE.ShaderMaterial;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uHead.value = (head + i * 0.13) % 1;
      line.visible = opacity > 0.004;
    });
  });

  return (
    <group>
      {lines.map((line, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <primitive key={i} object={line} />
      ))}
    </group>
  );
}
