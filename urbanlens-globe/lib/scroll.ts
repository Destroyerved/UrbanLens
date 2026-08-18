/**
 * Shared mutable state — bridges DOM / GSAP / Lenis / React state and the
 * R3F render loop without triggering React re-renders.
 */
export const scrollState = {
  /** 0..1 across the orbital story container or custom progress */
  progress: 0,
  /** 0..1 preloader / intro entrance */
  intro: 1,
  /** 0..1 visibility of city markers / outline (derived from progress or manual toggle) */
  markers: 0,
  /** prefers-reduced-motion flag */
  reduced: false,
  /** Enable automatic idle rotation in standalone/hero mode */
  autoRotate: false,
  /** Custom rotation speed multiplier */
  rotationSpeed: 1,
};

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
