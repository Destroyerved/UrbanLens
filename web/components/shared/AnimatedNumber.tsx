"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a numeric value up/down with easing — deterministic display only.
 *
 * The count runs on requestAnimationFrame, which browsers suspend in a hidden
 * or backgrounded tab. Left alone that means a dashboard opened in a background
 * tab — or on a second monitor that never took focus — reads 0 across every
 * metric until someone clicks it, which looks like a data failure rather than a
 * paused animation. So the value is the source of truth and the animation is
 * only ever a way of arriving at it: if the tab is hidden, or the reader has
 * asked for reduced motion, it lands on the number immediately.
 */
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
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const settle = () => {
      cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
      setDisplay(value);
    };

    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || document.hidden) {
      settle();
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

    // If the tab is hidden mid-count the frames stop arriving; finish the
    // number rather than freezing part-way through it.
    document.addEventListener("visibilitychange", settle);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", settle);
    };
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
