"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clamp, smoothstep, stage } from "@/lib/landing/timeline";

/* ── scene: scroll length + a viewport overlay that cross-dissolves ── */

const SCRIM: Record<string, string> = {
  left: "ulc-scrim-l",
  right: "ulc-scrim-r",
  center: "ulc-scrim-c",
  none: "",
};

export function Scene({
  index,
  id,
  vh = 240,
  scrim = "none",
  children,
  className = "",
}: {
  index: number;
  id?: string;
  vh?: number;
  scrim?: keyof typeof SCRIM;
  children: ReactNode;
  className?: string;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (compact) return;
    let raf = 0;
    let last = -1;
    let entranceReady = index !== 0;

    // Give the browser time to paint the initial state so the landing entrance animation is witnessed on load/refresh
    const timer =
      index === 0
        ? setTimeout(() => {
            entranceReady = true;
            if (overlay.current) {
              overlay.current.classList.add("ulc-in");
            }
          }, 150)
        : null;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = overlay.current;
      if (!el) return;
      const d = stage.T - index;
      const o = smoothstep(-0.1, 0.02, d) * (1 - smoothstep(0.8, 0.92, d));
      if (Math.abs(o - last) > 0.004) {
        last = o;
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o < 0.006 ? "hidden" : "visible";
        el.style.pointerEvents = o > 0.55 ? "auto" : "none";
        el.style.setProperty("--p", clamp(d).toFixed(3));
        if (index === 0) {
          el.classList.toggle("ulc-in", entranceReady && o > 0.12);
        } else {
          el.classList.toggle("ulc-in", o > 0.12);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [index, compact]);

  if (compact) {
    return (
      <section
        data-scene={index}
        id={id}
        className="ulc-in relative z-10 flex min-h-svh items-center py-24"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(2,4,10,.25), rgba(2,4,10,.72) 22%, rgba(2,4,10,.74) 78%, rgba(2,4,10,.25))",
          }}
        />
        <div className={`relative w-full ${className}`}>{children}</div>
      </section>
    );
  }

  return (
    <section data-scene={index} id={id} className="relative" style={{ height: `${vh}svh` }}>
      <div
        ref={overlay}
        className="ulc-scene fixed inset-0 z-10 h-svh w-full overflow-hidden"
        style={{ opacity: 0, visibility: "hidden", pointerEvents: "none" }}
      >
        {scrim !== "none" && (
          <div className={`pointer-events-none absolute inset-0 ${SCRIM[scrim]}`} />
        )}
        <div className={`relative h-full w-full ${className}`}>{children}</div>
      </div>
    </section>
  );
}

/* ── typography ─────────────────────────────────────────────────── */

export function Display({
  lines,
  size = "d2",
  className = "",
  as: Tag = "h2",
}: {
  lines: string[];
  size?: "d1" | "d2" | "d3";
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Tag className={`ulc-display ulc-${size} ${className}`} style={{ perspective: "700px" }}>
      {lines.map((l, i) => {
        const words = l.split(" ");
        return (
          <span className="ulc-line block overflow-hidden" key={i}>
            <span className="inline-flex flex-wrap justify-center gap-x-[0.28em]">
              {words.map((w, wi) => {
                const chars = w.split("");
                const centerIdx = Math.floor(chars.length / 2);
                return (
                  <span key={wi} className="inline-flex whitespace-nowrap">
                    {chars.map((char, ci) => {
                      const dist = ci - centerIdx;
                      return (
                        <span
                          key={ci}
                          className="ulc-char inline-block will-change-transform"
                          style={{
                            transition: `transform 1.1s cubic-bezier(0.16, 1, 0.3, 1) ${
                              i * 120 + wi * 38 + ci * 20
                            }ms, opacity 0.9s ease ${i * 120 + wi * 38 + ci * 20}ms`,
                            transform: `translate3d(${dist * 6}px, 110%, 0) rotateX(32deg) rotateY(${dist * 4}deg)`,
                            opacity: 0,
                          }}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </span>
                );
              })}
            </span>
          </span>
        );
      })}
    </Tag>
  );
}

export function Chapter({ children }: { children: ReactNode }) {
  return (
    <div className="ulc-fade flex items-center gap-3">
      <span className="h-px w-7 bg-[rgba(22,217,245,.7)]" />
      <span className="ulc-tech" style={{ color: "rgba(22,217,245,.85)" }}>
        {children}
      </span>
    </div>
  );
}

export function Copy({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`ulc-fade ulc-copy ${className}`}>{children}</p>;
}

/* ── timeline-driven counter (no React renders per frame) ───────── */

export function Counter({
  scene,
  from,
  to,
  start = 0.1,
  end = 0.6,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: {
  scene: number;
  from: number;
  to: number;
  start?: number;
  end?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const fmt = (v: number) => {
      const s = v.toFixed(decimals);
      const [i, d] = s.split(".");
      return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? `.${d}` : "");
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const local = clamp(stage.T - scene);
      const t = clamp((local - start) / Math.max(0.001, end - start));
      const e = 1 - Math.pow(1 - t, 3);
      const txt = prefix + fmt(from + (to - from) * e) + suffix;
      if (txt !== last && ref.current) {
        ref.current.textContent = txt;
        last = txt;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, from, to, start, end, decimals, prefix, suffix]);
  return (
    <span ref={ref} className={`ulc-num ${className}`}>
      {prefix}
      {from.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Reveals its children once the shared timeline passes a threshold. */
export function At({
  scene,
  at,
  children,
  className = "",
}: {
  scene: number;
  at: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(max-width: 860px)").matches) {
      if (ref.current) {
        ref.current.style.opacity = "1";
        ref.current.style.transform = "none";
        ref.current.style.filter = "none";
      }
      return;
    }
    let raf = 0;
    let on: boolean | null = null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const next = stage.T - scene >= at;
      if (next !== on && ref.current) {
        on = next;
        ref.current.style.opacity = next ? "1" : "0";
        ref.current.style.transform = next ? "none" : "translateY(14px)";
        ref.current.style.filter = next ? "none" : "blur(7px)";
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, at]);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: 0,
        transform: "translateY(14px)",
        filter: "blur(7px)",
        transition:
          "opacity .6s ease, transform .8s cubic-bezier(.16,1,.3,1), filter .6s ease",
      }}
    >
      {children}
    </div>
  );
}

/** A thin technical readout row — never a card. */
export function Readout({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-[rgba(215,236,255,.12)] py-2.5">
      <span className="ulc-tech-sm">{label}</span>
      <span className="ulc-num text-[13px]" style={{ color: tone ?? "#fff" }}>
        {value}
      </span>
    </div>
  );
}

export function Meter({ value, tone = "#16D9F5", delay = 0 }: { value: number; tone?: string; delay?: number }) {
  const { ref, on } = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className="block h-px w-full bg-[rgba(215,236,255,.14)]">
      <span
        className="block h-px"
        style={{
          width: on ? `${value}%` : "0%",
          background: tone,
          boxShadow: `0 0 10px ${tone}`,
          transition: `width 1.1s cubic-bezier(.16,1,.3,1) ${delay}ms`,
        }}
      />
    </span>
  );
}

export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setOn(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, on };
}
