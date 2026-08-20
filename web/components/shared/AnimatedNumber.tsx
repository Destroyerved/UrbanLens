"use client";

import { useEffect, useRef } from "react";

/**
 * Counts a numeric value up/down with easing — deterministic display only.
 *
 * WHY THIS WRITES TO THE DOM INSTEAD OF setState
 * ---------------------------------------------
 * The previous version gave every instance its own requestAnimationFrame loop
 * and called setState on each frame. A panel shows a dozen of these at once, so
 * arriving at the Overview cost ~12 rAF loops and ~700 React renders a second —
 * every one of them re-rendering a GlowCard subtree — for the sole purpose of
 * changing one text node. That is the single largest source of jank in the app
 * shell, and it competes with MapLibre for the same frame budget.
 *
 * Now one shared driver ticks every live counter and writes textContent
 * directly. React renders each counter once, on mount, and never again during
 * the animation.
 */

type Job = {
  el: HTMLSpanElement;
  from: number;
  to: number;
  start: number;
  duration: number;
  format: (n: number) => string;
};

const jobs = new Set<Job>();
let raf = 0;

function tick(now: number) {
  for (const job of jobs) {
    const k = Math.min(1, (now - job.start) / job.duration);
    const ease = 1 - Math.pow(1 - k, 3);
    job.el.textContent = job.format(job.from + (job.to - job.from) * ease);
    if (k >= 1) jobs.delete(job);
  }
  // Idle when nothing is animating. A permanently scheduled rAF keeps the
  // compositor awake and shows up as constant main-thread work in a profile.
  raf = jobs.size > 0 ? requestAnimationFrame(tick) : 0;
}

function schedule(job: Job) {
  jobs.add(job);
  if (!raf) raf = requestAnimationFrame(tick);
}

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
  const ref = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(0);
  // Read through refs so a new inline `format` closure on every parent render
  // cannot restart the animation.
  const formatRef = useRef(format);
  formatRef.current = format;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = fromRef.current;
    fromRef.current = value;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || from === value) {
      el.textContent = formatRef.current(value);
      return;
    }

    const job: Job = {
      el,
      from,
      to: value,
      start: performance.now(),
      duration: durationRef.current,
      format: (n) => formatRef.current(n),
    };
    schedule(job);
    return () => {
      jobs.delete(job);
    };
  }, [value]);

  // Server and first client render agree on the pre-animation value, so there
  // is no hydration mismatch; the driver takes over immediately after mount.
  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}

export default AnimatedNumber;
