"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import GlobeCanvas, { type GlobeCanvasProps } from "./GlobeCanvas";
import { scrollState } from "./lib/scroll";

export type CinematicGlobeProps = GlobeCanvasProps & {
  /**
   * Display mode:
   * - "standalone": Standalone 3D globe with auto-rotation (ideal for Hero sections or cards)
   * - "scroll": Scroll-driven cinematic camera journey (wide orbit → approach → India → Gujarat)
   * - "manual": Controlled via `progress` prop (0..1)
   */
  mode?: "standalone" | "scroll" | "manual";
  /** Manual progress (0..1) when mode="manual" */
  progress?: number;
  /** Background vignette gradient overlay */
  showVignette?: boolean;
};

/**
 * CinematicGlobe — Drop-in 3D Earth Intelligence Globe component.
 *
 * Supports both standalone hero showcase mode and multi-stage scroll choreography.
 */
export default function CinematicGlobe({
  mode = "standalone",
  progress,
  showVignette = true,
  autoRotate = mode === "standalone",
  rotationSpeed = 1,
  showMarkers = true,
  showOutline = true,
  showStars = true,
  onReady,
  className = "relative w-full h-full min-h-[400px]",
  style,
  ...props
}: CinematicGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleReady = useCallback(() => {
    setIsLoaded(true);
    onReady?.();
  }, [onReady]);

  // Handle manual progress prop
  useEffect(() => {
    if (mode === "manual" && typeof progress === "number") {
      scrollState.progress = Math.max(0, Math.min(1, progress));
    }
  }, [mode, progress]);

  // Handle autoRotate and rotationSpeed
  useEffect(() => {
    scrollState.autoRotate = autoRotate;
    scrollState.rotationSpeed = rotationSpeed;
  }, [autoRotate, rotationSpeed]);

  // Handle scroll-driven mode if using native scroll container
  useEffect(() => {
    if (mode !== "scroll") return;

    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const totalHeight = rect.height - windowHeight;

      if (totalHeight > 0) {
        const scrolled = -rect.top;
        const p = Math.max(0, Math.min(1, scrolled / totalHeight));
        scrollState.progress = p;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [mode]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: "transparent",
        ...style,
      }}
    >
      <GlobeCanvas
        onReady={handleReady}
        autoRotate={autoRotate}
        rotationSpeed={rotationSpeed}
        showMarkers={showMarkers}
        showOutline={showOutline}
        showStars={showStars}
        forceMarkersVisible={mode === "standalone"}
        {...props}
      />

      {showVignette && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(120% 100% at 60% 45%, transparent 45%, rgba(2, 4, 9, 0.6) 100%)",
          }}
        />
      )}
    </div>
  );
}
