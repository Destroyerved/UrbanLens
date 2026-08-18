"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { setProgress, globeState } from "./lib/store";
import { stageForProgress, type GlobeStage } from "./lib/stage";

let registered = false;
function ensureRegistered() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export interface GlobeScrollControllerProps {
  /** the tall section that defines the scroll length */
  targetRef: React.RefObject<HTMLElement | null>;
  onStageChange?: (stage: GlobeStage) => void;
  onGujaratFocus?: () => void;
  onSequenceComplete?: () => void;
}

/**
 * Drives the shared timeline from scroll position with GSAP ScrollTrigger.
 *
 * Renders nothing. The trigger, its listeners and any tweens are killed on
 * unmount, and progress is written to a plain object rather than React state so
 * scrolling never triggers a re-render.
 */
export default function GlobeScrollController({
  targetRef,
  onStageChange,
  onGujaratFocus,
  onSequenceComplete,
}: GlobeScrollControllerProps) {
  useEffect(() => {
    const el = targetRef.current;
    if (!el || typeof window === "undefined") return;

    ensureRegistered();

    let lastStage: GlobeStage | null = null;
    let firedGujarat = false;
    let firedComplete = false;

    const update = (p: number) => {
      setProgress(p);
      const stage = stageForProgress(p);
      if (stage !== lastStage) {
        lastStage = stage;
        onStageChange?.(stage);
        if (stage === "gujarat" && !firedGujarat) {
          firedGujarat = true;
          onGujaratFocus?.();
        }
        if (stage === "complete" && !firedComplete) {
          firedComplete = true;
          onSequenceComplete?.();
        }
      }
    };

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => update(self.progress),
      onRefresh: (self) => update(self.progress),
    });

    // if the visitor lands mid-page (a refresh, or a hash link), sync at once
    update(trigger.progress);

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.removeEventListener("orientationchange", onResize);
      trigger.kill();
      gsap.killTweensOf(globeState);
    };
  }, [targetRef, onStageChange, onGujaratFocus, onSequenceComplete]);

  return null;
}
