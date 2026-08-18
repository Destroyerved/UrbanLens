"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Earth from "./Earth";
import Clouds from "./Clouds";
import Atmosphere from "./Atmosphere";
import Starfield from "./Starfield";
import GujaratOverlay from "./GujaratOverlay";
import CityMarkers from "./CityMarkers";
import CityLinks from "./CityLinks";
import { GUJARAT_CENTER, INDIA_CENTER } from "./data/gujaratCities";
import { faceRotation, shortestAngle } from "./lib/geo";
import { cameraForProgress, layersForProgress } from "./lib/stage";
import { globeState, setReady } from "./lib/store";
import { disposeTextures, loadEarthTextures, type EarthTextures } from "./lib/textures";

export interface GlobeCanvasProps {
  texturePath?: string;
  accent?: string;
  atmosphereColor?: string;
  showCities?: boolean;
  showCityLabels?: boolean;
  showGrid?: boolean;
  quality?: "auto" | "high" | "low";
  className?: string;
}

/* ── the rig: one place where the timeline becomes camera motion ──────── */

function GlobeRig({
  textures,
  accent,
  atmosphereColor,
  showCities = false,
  showCityLabels = false,
  showGrid,
  segments,
  starCount,
  compact,
}: {
  textures: EarthTextures;
  accent: string;
  atmosphereColor: string;
  showCities?: boolean;
  showCityLabels?: boolean;
  showGrid: boolean;
  segments: number;
  starCount: number;
  compact: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const sunDirection = useMemo(() => new THREE.Vector3(-0.55, 0.28, 0.79).normalize(), []);
  const india = useMemo(() => faceRotation(INDIA_CENTER[1], INDIA_CENTER[0]), []);
  const gujarat = useMemo(() => faceRotation(GUJARAT_CENTER[1], GUJARAT_CENTER[0]), []);

  const spin = useRef(0);
  const ready = useRef(false);

  useFrame((_, delta) => {
    const p = globeState.progress;
    const key = cameraForProgress(p, compact);
    const layers = layersForProgress(p);

    // idle rotation, slowed to a crawl once the camera starts closing in
    if (!globeState.reducedMotion) {
      spin.current += delta * 0.035 * key.spin;
    }

    if (globe.current) {
      // blend the free spin toward India, then toward Gujarat
      const lock = Math.max(key.indiaLock, key.gujaratLock);
      const targetY = key.gujaratLock > key.indiaLock ? gujarat.y : india.y;
      const targetX = key.gujaratLock > key.indiaLock ? gujarat.x : india.x;

      const free = spin.current;
      const y = free + shortestAngle(free, targetY) * lock;
      globe.current.rotation.set(targetX * lock, y, 0);
    }

    if (root.current) {
      root.current.position.set(
        key.offsetX * key.distance * 0.3,
        key.offsetY * key.distance * 0.24,
        0
      );
      // the whole scene eases away as the page hands over to the next section
      root.current.scale.setScalar(1 - layers.handover * 0.06);
    }

    camera.position.z = key.distance;
    camera.lookAt(0, 0, 0);

    if (!ready.current) {
      ready.current = true;
      setReady(true);
    }
  });

  return (
    <group ref={root}>
      <Starfield count={starCount} />
      <Atmosphere sunDirection={sunDirection} color={atmosphereColor} />

      <group ref={globe}>
        <Earth textures={textures} sunDirection={sunDirection} segments={segments} rimColor={atmosphereColor} scanColor={accent} />
        <Clouds
          map={textures.clouds}
          sunDirection={sunDirection}
          segments={Math.max(32, Math.round(segments * 0.66))}
        />
        <GujaratOverlay accent={accent} showGrid={showGrid} />
        {showCities && (
          <>
            <CityLinks accent={accent} />
            <CityMarkers accent={accent} showLabels={showCityLabels} compact={compact} />
          </>
        )}
      </group>
    </group>
  );
}

/* ── the canvas host ──────────────────────────────────────────────────── */

export default function GlobeCanvas({
  texturePath = "/urbanlens-globe",
  accent = "#16D9F5",
  atmosphereColor = "#7ABEFF",
  showCities = false,
  showCityLabels = false,
  showGrid = true,
  quality = "auto",
  className,
}: GlobeCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const [textures, setTextures] = useState<EarthTextures | null>(null);
  const [visible, setVisible] = useState(true);
  const [compact, setCompact] = useState(false);

  /* responsive + reduced motion */
  useEffect(() => {
    const mqCompact = window.matchMedia("(max-width: 860px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setCompact(mqCompact.matches);
      globeState.compact = mqCompact.matches;
      globeState.reducedMotion = mqMotion.matches;
    };
    apply();
    mqCompact.addEventListener("change", apply);
    mqMotion.addEventListener("change", apply);
    return () => {
      mqCompact.removeEventListener("change", apply);
      mqMotion.removeEventListener("change", apply);
    };
  }, []);

  /* stop rendering entirely when the hero is off screen */
  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "10% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* textures (async, never blocks first paint) */
  useEffect(() => {
    let cancelled = false;
    let loaded: EarthTextures | null = null;
    loadEarthTextures(texturePath).then((t) => {
      if (cancelled) {
        disposeTextures(t);
        return;
      }
      loaded = t;
      setTextures(t);
    });
    return () => {
      cancelled = true;
      disposeTextures(loaded);
    };
  }, [texturePath]);

  const low = quality === "low" || (quality === "auto" && compact);
  const segments = low ? 64 : 96;
  const starCount = low ? 500 : 1200;
  const dpr: [number, number] = low ? [1, 1.25] : [1, 1.6];

  return (
    <div ref={host} className={className} aria-hidden="true">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={dpr}
        gl={{ antialias: !low, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 34, position: [0, 0, 4.6], near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {textures && (
          <GlobeRig
            textures={textures}
            accent={accent}
            atmosphereColor={atmosphereColor}
            showCityLabels={showCityLabels && !low}
            showGrid={showGrid}
            segments={segments}
            starCount={starCount}
            compact={compact}
          />
        )}
      </Canvas>
    </div>
  );
}
