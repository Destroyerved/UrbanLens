"use client";

import { useSyncExternalStore } from "react";
import { GLOBE_STAGES, stageForProgress, type GlobeStage } from "./stage";

/**
 * A deliberately tiny store.
 *
 * `progress` is written up to 60×/second by the scroll controller and read
 * inside the render loop, so it is kept OUTSIDE React — nothing re-renders
 * while you scroll. Only `stage` (which changes ~5 times in the whole
 * sequence) is exposed as reactive state for the HTML overlay.
 */
export const globeState = {
  /** 0 → 1 across the whole pinned sequence */
  progress: 0,
  stage: "earth" as GlobeStage,
  /** true once the WebGL scene has drawn its first frame */
  ready: false,
  reducedMotion: false,
  compact: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot = { stage: globeState.stage, ready: globeState.ready };

function emit() {
  snapshot = { stage: globeState.stage, ready: globeState.ready };
  listeners.forEach((l) => l());
}

export function setProgress(p: number) {
  globeState.progress = p;
  const next = stageForProgress(p);
  if (next !== globeState.stage) {
    globeState.stage = next;
    emit();
  }
}

export function setReady(ready: boolean) {
  if (globeState.ready === ready) return;
  globeState.ready = ready;
  emit();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const server = { stage: "earth" as GlobeStage, ready: false };

export function useGlobeSnapshot() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => server
  );
}

export { GLOBE_STAGES };
export type { GlobeStage };
