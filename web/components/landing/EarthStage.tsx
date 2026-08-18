"use client";

import { useEffect, useRef } from "react";
import GlobeCanvas from "@/components/urbanlens-globe/GlobeCanvas";
import { scrollState } from "@/components/urbanlens-globe/lib/scroll";
import { clamp, stage, stageOpacity } from "@/lib/landing/timeline";

export default function EarthStage() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastOpacity = -1;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const T = stage.T;
      // Opening narrative (T 0..3.8) -> progress 0..1
      if (T <= 4.0) {
        scrollState.progress = clamp(T / 3.8);
      } else if (T >= 11.6) {
        // Outro & finale (T >= 11.6) -> return to wide planet view
        scrollState.progress = 0;
      }

      const { earth: opacity } = stageOpacity(T);
      if (Math.abs(opacity - lastOpacity) > 0.003) {
        lastOpacity = opacity;
        if (host.current) {
          host.current.style.opacity = opacity.toFixed(3);
          host.current.style.visibility = opacity < 0.005 ? "hidden" : "visible";
          host.current.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={host}
      className="ul-stage-earth pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0 }}
      aria-hidden="true"
    >
      <GlobeCanvas
        showMarkers={true}
        showOutline={true}
        showStars={true}
        className="size-full"
      />
    </div>
  );
}
