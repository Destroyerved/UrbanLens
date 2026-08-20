"use client";

import { useEffect, useRef, useState } from "react";
import GlobeCanvas from "@/components/urbanlens-globe/GlobeCanvas";
import { setProgress } from "@/components/urbanlens-globe/lib/store";
import { clamp, stage, stageOpacity } from "@/lib/landing/timeline";

export default function EarthStage() {
  const host = useRef<HTMLDivElement>(null);
  const [renderGlobe, setRenderGlobe] = useState(true);
  const renderGlobeRef = useRef(true);

  useEffect(() => {
    let raf = 0;
    let lastOpacity = -1;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const T = stage.T;
      const shouldRender = T < 4.25;
      if (shouldRender !== renderGlobeRef.current) {
        renderGlobeRef.current = shouldRender;
        setRenderGlobe(shouldRender);
      }
      // Map stage.T (0 -> 3.8) to globe progress (0 -> 1)
      const progress = clamp(T / 3.8);
      setProgress(progress);

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
      {renderGlobe && (
        <GlobeCanvas
          texturePath="/textures"
          accent="#16D9F5"
          atmosphereColor="#7ABEFF"
          showCities={false}
          showCityLabels={false}
          showGrid={true}
          quality="low"
          className="size-full"
        />
      )}
    </div>
  );
}
