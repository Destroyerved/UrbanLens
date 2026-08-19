"use client";

import { useEffect, useRef, useState } from "react";

/** Whether the reader has asked their OS to reduce motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts a numeric value up/down with easing — deterministic display only. */
export function AnimatedNumber({
  value,
  format = (n: number) => `${Math.round(n)}`,
  duration = 900,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    // Counting up is decoration. Under reduced motion the number is simply the
    // number — and that also means it is never briefly wrong, which matters
    // because every one of these starts at 0: a reader who glances at the KPI
    // panel during the first frames sees a population of zero.
    if (prefersReducedMotion()) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (value - from) * ease);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}

export default AnimatedNumber;
