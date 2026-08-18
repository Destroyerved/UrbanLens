"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GUJARAT_CITIES, type GlobeCity } from "./data/gujaratCities";
import { latLngToVec3 } from "./lib/geo";
import { layersForProgress } from "./lib/stage";
import { globeState } from "./lib/store";

export interface CityMarkersProps {
  cities?: GlobeCity[];
  accent?: string;
  showLabels?: boolean;
  /** on small screens only tier-1 nodes are labelled */
  compact?: boolean;
}

/**
 * GIS-style urban nodes: a small dot, a fixed reticle ring and a slow radar
 * pulse. Labels are real DOM (drei <Html>) so they stay crisp and selectable.
 */
export default function CityMarkers({
  cities = GUJARAT_CITIES,
  accent = "#16D9F5",
  showLabels = true,
  compact = false,
}: CityMarkersProps) {
  const group = useRef<THREE.Group>(null);
  const pulses = useRef<THREE.Mesh[]>([]);
  const dots = useRef<THREE.Mesh[]>([]);
  const rings = useRef<THREE.Mesh[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);

  const placed = useMemo(
    () =>
      cities.map((c) => ({
        city: c,
        position: latLngToVec3(c.coord[1], c.coord[0], 1.004),
      })),
    [cities]
  );

  useFrame(({ clock }) => {
    const layers = layersForProgress(globeState.progress);
    const t = clock.elapsedTime;
    const reduce = globeState.reducedMotion;

    const setOpacity = (m: THREE.Mesh | undefined, value: number) => {
      if (!m) return;
      const mat = m.material as THREE.Material & { opacity: number };
      mat.opacity = value;
      m.visible = value > 0.005;
    };

    placed.forEach((_, i) => {
      const tierBoost = placed[i].city.tier === 1 ? 1 : 0.75;
      setOpacity(dots.current[i], layers.cities * tierBoost);
      setOpacity(rings.current[i], layers.cities * 0.55 * tierBoost);

      const pulse = pulses.current[i];
      if (pulse) {
        const phase = reduce ? 0.4 : ((t * 0.42 + i * 0.17) % 1);
        pulse.scale.setScalar(0.6 + phase * 1.7);
        setOpacity(pulse, layers.cities * (1 - phase) * 0.45 * tierBoost);
      }

      const label = labels.current[i];
      if (label) {
        const visible = showLabels ? layers.labels : 0;
        label.style.opacity = String(visible * (placed[i].city.tier === 1 ? 1 : 0.72));
      }
    });
  });

  return (
    <group ref={group}>
      {placed.map(({ city, position }, i) => {
        const outward = position.clone().multiplyScalar(2);
        return (
          <group key={city.id} position={position}>
            <mesh
              ref={(el) => {
                if (el) dots.current[i] = el;
              }}
              visible={false}
            >
              <sphereGeometry args={[city.tier === 1 ? 0.0055 : 0.004, 12, 12]} />
              <meshBasicMaterial color={accent} transparent opacity={0} />
            </mesh>

            <mesh
              ref={(el) => {
                if (el) rings.current[i] = el;
              }}
              onUpdate={(self) => self.lookAt(outward)}
              visible={false}
            >
              <ringGeometry args={[0.011, 0.0128, 40]} />
              <meshBasicMaterial
                color={accent}
                transparent
                opacity={0}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            <mesh
              ref={(el) => {
                if (el) pulses.current[i] = el;
              }}
              onUpdate={(self) => self.lookAt(outward)}
              visible={false}
            >
              <ringGeometry args={[0.013, 0.0145, 48]} />
              <meshBasicMaterial
                color={accent}
                transparent
                opacity={0}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            {showLabels && city.tier === 1 && (
              <Html
                center={false}
                distanceFactor={0.62}
                position={[
                  city.labelOffset?.[0] ?? 0.012,
                  city.labelOffset?.[1] ?? 0.01,
                  0.004,
                ]}
                zIndexRange={[20, 0]}
                style={{ pointerEvents: "none" }}
                occlude={false}
              >
                <div
                  ref={(el) => {
                    labels.current[i] = el;
                  }}
                  className="ulg-city-label"
                  style={{ opacity: 0 }}
                >
                  {city.name}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
