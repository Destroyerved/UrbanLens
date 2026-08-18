"use client";

/**
 * The fourteen scenes of the UrbanLens landing film.
 *
 * Text sits directly on the cinematic environment — no cards, no panels — and
 * every scene is anchored to the same composition grid so the eye never has to
 * re-acquire the page while the globe and the city move behind it.
 */

import { useEffect, useMemo, useRef } from "react";
import { At, Copy, Counter, Display, Meter, Readout, Scene } from "./kit";
import { clamp, stage } from "@/lib/landing/timeline";
import { filterCounts, FLAGSHIP, CITY_STATS } from "@/lib/landing/city-layers";
import {
  APP_ROUTE,
  EXPLAIN,
  FINAL,
  FOOTER,
  HERO,
  IDENTIFY,
  LOCATE,
  METRICS,
  OBSERVE,
  POSITIONING,
  PREDICT,
  PROBLEM,
  QUIET,
  RECOMMEND,
  SIMULATE,
  UNDERSTAND,
} from "@/lib/landing/story";

const PAD = "px-[clamp(18px,3.4vw,44px)]";
const COL = "w-full max-w-[min(1440px,100%)] mx-auto";

/* ══════════════════════════ 00 · HERO ══════════════════════════ */

export function HeroScene() {
  return (
    <Scene index={0} id="top" vh={210}>
      <div className={`flex h-full flex-col justify-between ${PAD} pb-10 pt-[104px]`}>
        <div className={`${COL} flex items-start justify-between`}>
          <span className="ulc-fade ulc-tech" style={{ transitionDelay: "150ms" }}>
            {HERO.eyebrowLeft}
          </span>
          <span className="ulc-fade ulc-tech" style={{ transitionDelay: "150ms" }}>
            {HERO.eyebrowRight}
          </span>
        </div>

        <div className={`${COL} flex flex-col items-center text-center`}>
          <Display as="h1" size="d1" lines={HERO.headline} />
          <div className="ulc-fade mt-8 flex flex-col items-center gap-3" style={{ transitionDelay: "850ms" }}>
            <span className="h-8 w-px bg-[rgba(215,236,255,.25)]" />
            <span className="ulc-tech">{HERO.micro}</span>
          </div>
        </div>

        <div className={`${COL} flex justify-center`}>
          <div className="ulc-fade flex flex-col items-center gap-2" style={{ transitionDelay: "1150ms" }}>
            <span className="ulc-tech-sm">{HERO.scroll}</span>
            <span className="relative block h-10 w-px overflow-hidden bg-[rgba(215,236,255,.18)]">
              <span
                className="absolute inset-x-0 h-4 bg-[var(--cyan)]"
                style={{ animation: "ulc-scroll 2.4s ease-in-out infinite" }}
              />
            </span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═════════════════════════ 01 · PROBLEM ════════════════════════ */

export function ProblemScene() {
  return (
    <Scene index={1} vh={230} scrim="left">
      <div className={`flex h-full items-center ${PAD}`}>
        <div className={COL}>
          <div className="ulc-drift max-w-[560px]">
            <Display size="d2" lines={PROBLEM.headline} />
            <Copy className="mt-7">{PROBLEM.copy}</Copy>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═════════════════════════ 02 · METRICS ════════════════════════ */

export function MetricsScene() {
  return (
    <Scene index={2} vh={280} scrim="right">
      <div className={`flex h-full items-center justify-end ${PAD}`}>
        <div className={`${COL} flex justify-end`}>
          <div className="ulc-drift w-full max-w-[480px]">
            {METRICS.map((m, i) => (
              <At key={m.label} scene={2} at={0.04 + i * 0.12} className="mb-7 last:mb-0">
                <div className="ulc-rule mb-4" />
                <div className="ulc-num ulc-metric text-white">{m.value}</div>
                <div className="ulc-tech mt-3">{m.label}</div>
              </At>
            ))}
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═════════════════════════ 03 · LOCATE ═════════════════════════ */

export function LocateScene() {
  const lastIdx = LOCATE.steps.length - 1;
  return (
    <Scene index={3} vh={230} scrim="center">
      <div className={`flex h-full flex-col items-center justify-center ${PAD}`}>
        <div className="flex flex-col items-center gap-5">
          {LOCATE.steps.map((s, i) => (
            <At key={s} scene={3} at={0.12 + i * 0.22}>
              <div
                data-no-cursor={s.toUpperCase().includes("INDIA") ? "true" : undefined}
                className="flex flex-col items-center gap-4"
              >
                <span
                  className="ulc-display"
                  style={{
                    fontSize: i === lastIdx ? "clamp(1.8rem,4.2vw,3.4rem)" : "clamp(1rem,1.8vw,1.5rem)",
                    color: i === lastIdx ? "#fff" : "rgba(215,236,255,.5)",
                    letterSpacing: i === lastIdx ? "-0.02em" : "0.06em",
                  }}
                >
                  {s}
                </span>
                {i < lastIdx && <span className="h-6 w-px bg-[rgba(22,217,245,.5)]" />}
              </div>
            </At>
          ))}
          <At scene={3} at={0.58}>
            <div data-no-cursor="true" className="mt-4 flex flex-col items-center gap-2">
              <span className="ulc-num text-[12px] text-[var(--cyan)]">{LOCATE.coords}</span>
              {LOCATE.note ? <span className="ulc-tech-sm">{LOCATE.note}</span> : null}
            </div>
          </At>
        </div>
      </div>
    </Scene>
  );
}

/* ═════════════════════════ 04 · OBSERVE ════════════════════════ */

function YearTrack() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clamp((clamp(stage.T - 4) - 0.1) / 0.6);
      const idx = Math.min(2, Math.floor(t * 2.999));
      if (idx !== last) {
        last = idx;
        refs.current.forEach((el, i) => {
          if (!el) return;
          const on = i <= idx;
          el.style.opacity = on ? "1" : "0.32";
          el.style.borderColor = on ? "rgba(22,217,245,.55)" : "rgba(215,236,255,.12)";
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="mt-8 grid max-w-[440px] grid-cols-3 gap-3">
      {OBSERVE.years.map((y, i) => (
        <div
          key={y}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="border-t pt-3 transition-all duration-500"
          style={{ borderColor: "rgba(215,236,255,.12)", opacity: 0.32 }}
        >
          <div className="ulc-tech-sm">{y}</div>
          <div className="ulc-num mt-2 text-[19px] text-white">
            {OBSERVE.builtUpKm2[y]}
            <span className="ml-1 text-[10px] text-[rgba(215,236,255,.5)]">KM²</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ObserveScene() {
  return (
    <Scene index={4} id="observe" vh={280} scrim="left">
      <div className={`flex h-full items-center ${PAD}`}>
        <div className={COL}>
          <div className="ulc-drift max-w-[540px]">
            <Display size="d2" lines={OBSERVE.headline} />
            <Copy className="mt-6">{OBSERVE.copy}</Copy>

            <YearTrack />

            <At scene={4} at={0.55} className="mt-9">
              <div className="flex items-end gap-8">
                <div>
                  <div className="ulc-num ulc-metric text-[var(--cyan)]">
                    +
                    <Counter scene={4} from={0} to={32.7} start={0.55} end={0.92} decimals={1} />%
                  </div>
                  <div className="ulc-tech mt-3">{OBSERVE.growthLabel}</div>
                </div>
                <div className="ulc-tech-sm pb-2">{OBSERVE.growthRange}</div>
              </div>
            </At>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═════════════════════════ 05 · PREDICT ════════════════════════ */

export function PredictScene() {
  return (
    <Scene index={5} id="predict" vh={280} scrim="right">
      <div className={`flex h-full items-center justify-end ${PAD}`}>
        <div className={`${COL} flex justify-end`}>
          <div className="ulc-drift w-full max-w-[520px]">
            <Display size="d2" lines={PREDICT.headline} />
            <Copy className="mt-6">{PREDICT.copy}</Copy>

            <At scene={5} at={0.32} className="mt-10">
              <div className="ulc-tech">{PREDICT.title}</div>
              <div className="mt-4 flex items-end gap-6">
                <div className="ulc-num ulc-metric text-[var(--warn)]">
                  <Counter scene={5} from={0} to={84} start={0.34} end={0.78} />%
                </div>
                <div className="pb-3">
                  <div className="ulc-tech">{PREDICT.valueLabel}</div>
                  <div className="ulc-num mt-2 text-[13px] text-white">{PREDICT.place}</div>
                </div>
              </div>
            </At>

            <At scene={5} at={0.5} className="mt-8">
              <div className="grid grid-cols-4 gap-3">
                {PREDICT.bands.map((b) => (
                  <div key={b.label}>
                    <span className="block h-px w-full" style={{ background: b.color }} />
                    <div className="ulc-tech-sm mt-2">{b.label}</div>
                    <div className="ulc-num mt-1 text-[10px] text-[rgba(215,236,255,.45)]">
                      {b.range}
                    </div>
                  </div>
                ))}
              </div>
            </At>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═══════════════════════ 06 · UNDERSTAND ═══════════════════════ */

export function UnderstandScene() {
  return (
    <Scene index={6} id="understand" vh={280} scrim="left">
      <div className={`flex h-full items-center ${PAD}`}>
        <div className={COL}>
          <div className="ulc-drift max-w-[560px]">
            <Display size="d2" className="mt-6" lines={UNDERSTAND.headline} />
            <Copy className="mt-6">{UNDERSTAND.copy}</Copy>

            <div className="mt-10 flex flex-wrap gap-x-16 gap-y-8">
              {UNDERSTAND.stats.map((s, i) => (
                <At key={s.label} scene={6} at={0.3 + i * 0.14}>
                  <div className="ulc-num ulc-metric text-[var(--crit)]">{s.value}</div>
                  <div className="ulc-tech mt-3 max-w-[220px] leading-relaxed">{s.label}</div>
                </At>
              ))}
            </div>

            <At scene={6} at={0.62} className="mt-8">
              <span className="ulc-tech-sm">
                SERVICE RADIUS {UNDERSTAND.radiusKm} KM · {CITY_STATS.facilities} FACILITIES ·{" "}
                {CITY_STATS.cells} POPULATION CELLS
              </span>
            </At>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ════════════════════════ 07 · IDENTIFY ════════════════════════ */

function FilterCascade() {
  const { counts } = useMemo(() => filterCounts(), []);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const total = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = clamp((clamp(stage.T - 7) - 0.05) / 0.72) * IDENTIFY.filters.length;
      const idx = Math.floor(s + 1e-4);
      if (total.current) total.current.textContent = String(counts[Math.min(idx, counts.length - 1)]);
      if (idx !== last) {
        last = idx;
        rows.current.forEach((el, i) => {
          if (!el) return;
          const on = i < idx;
          el.style.opacity = on ? "1" : "0.3";
          el.style.borderColor = on ? "rgba(22,217,245,.4)" : "rgba(215,236,255,.1)";
          const c = el.querySelector<HTMLElement>("[data-c]");
          if (c) {
            c.textContent = on ? String(counts[i + 1]) : "—";
            c.style.color = on ? "var(--cyan)" : "rgba(215,236,255,.35)";
          }
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [counts]);

  return (
    <div className="mt-9">
      <div className="flex items-end justify-between">
        <div>
          <span ref={total} className="ulc-num ulc-metric text-[var(--cyan)]">
            {counts[0]}
          </span>
          <span className="ulc-num ml-3 text-[13px] text-[rgba(215,236,255,.4)]">
            / {counts[0]}
          </span>
        </div>
        <span className="ulc-tech-sm pb-3">CANDIDATE PARCELS</span>
      </div>

      <div className="mt-6 space-y-0">
        {IDENTIFY.filters.map((f, i) => (
          <div
            key={f.key}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className="flex items-baseline justify-between gap-6 border-t py-3 transition-all duration-500"
            style={{ borderColor: "rgba(215,236,255,.1)", opacity: 0.3 }}
          >
            <span className="ulc-tech">{f.label}</span>
            <span data-c className="ulc-num text-[13px]">
              —
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IdentifyScene() {
  return (
    <Scene index={7} id="identify" vh={300} scrim="right">
      <div className={`flex h-full items-center justify-end ${PAD}`}>
        <div className={`${COL} flex justify-end`}>
          <div className="ulc-drift w-full max-w-[500px]">
            <Display size="d2" className="mt-6" lines={IDENTIFY.headline} />
            <Copy className="mt-6">{IDENTIFY.copy}</Copy>
            <FilterCascade />
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═══════════════════════ 08 · RECOMMEND ════════════════════════ */

export function RecommendScene() {
  return (
    <Scene index={8} id="recommend" vh={310} scrim="center">
      <div className={`flex h-full items-center ${PAD}`}>
        <div className={`${COL} grid gap-12 lg:grid-cols-[1fr_400px]`}>
          <div className="ulc-drift self-center max-w-[500px]">
            <Display size="d2" lines={RECOMMEND.headline} />

            <At scene={8} at={0.22} className="mt-10">
              <div className="ulc-tech">{RECOMMEND.title}</div>
              <div className="mt-4 flex items-end gap-6">
                <span className="ulc-num ulc-d2 text-white">{RECOMMEND.parcelId}</span>
              </div>
              <div className="mt-5 flex items-end gap-3">
                <span className="ulc-num ulc-metric text-[var(--cyan)]">
                  <Counter scene={8} from={40} to={94} start={0.24} end={0.62} />
                </span>
                <span className="ulc-num pb-3 text-[13px] text-[rgba(215,236,255,.5)]">
                  {RECOMMEND.scoreOutOf}
                </span>
              </div>
              <div className="ulc-tech-sm mt-4">
                {FLAGSHIP.areaHa.toFixed(1)} HA · GOVERNMENT · FLOOD RISK{" "}
                {FLAGSHIP.floodRisk.toUpperCase()}
              </div>
            </At>
          </div>

          <div className="ulc-drift self-center">
            <At scene={8} at={0.34}>
              <div className="ulc-tech mb-4">SUITABILITY FACTORS</div>
              {RECOMMEND.factors.map((f, i) => (
                <div key={f.label} className="mb-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="ulc-tech-sm">{f.label}</span>
                    <span className="ulc-num text-[13px] text-white">{f.value}</span>
                  </div>
                  <Meter
                    value={f.value}
                    delay={i * 90}
                    tone={f.value >= 90 ? "#2DD58B" : f.value >= 80 ? "#16D9F5" : "#E9C46A"}
                  />
                </div>
              ))}
            </At>

            <At scene={8} at={0.56} className="mt-8">
              <div className="ulc-tech mb-3">{RECOMMEND.whyTitle}</div>
              <ul className="space-y-2">
                {RECOMMEND.why.map((w) => (
                  <li key={w} className="flex items-start gap-3">
                    <span className="mt-[7px] block h-px w-3 bg-[var(--good)]" />
                    <span className="text-[12.5px] leading-snug text-[rgba(215,236,255,.78)]">
                      {w}
                    </span>
                  </li>
                ))}
              </ul>
            </At>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ════════════════════════ 09 · SIMULATE ════════════════════════ */

export function SimulateScene() {
  return (
    <Scene index={9} id="simulate" vh={300} scrim="right">
      <div className={`flex h-full items-center justify-end ${PAD}`}>
        <div className={`${COL} flex justify-end`}>
          <div className="ulc-drift w-full max-w-[500px]">
            <Display size="d2" lines={SIMULATE.headline} />

            <At scene={9} at={0.2} className="mt-10">
              <div className="flex items-end gap-10">
                <div>
                  <div className="ulc-tech-sm">{SIMULATE.before.tag}</div>
                  <div className="ulc-num mt-3 text-[clamp(1.8rem,3.4vw,3rem)] leading-none text-[var(--warn)]">
                    {SIMULATE.before.value}
                  </div>
                </div>
                <span className="pb-4 text-[rgba(215,236,255,.4)]">→</span>
                <div>
                  <div className="ulc-tech-sm">{SIMULATE.after.tag}</div>
                  <div className="ulc-num mt-3 ulc-metric text-[var(--good)]">
                    <Counter scene={9} from={64} to={88} start={0.22} end={0.66} />%
                  </div>
                </div>
              </div>
              <div className="ulc-tech mt-4">{SIMULATE.after.label}</div>
            </At>

            <At scene={9} at={0.46} className="mt-10">
              <Readout
                label={SIMULATE.newly.label}
                value={
                  <span className="text-[var(--good)]">
                    +<Counter scene={9} from={0} to={46800} start={0.46} end={0.86} />
                  </span>
                }
              />
              <Readout
                label={SIMULATE.distance.label}
                value={
                  <>
                    <span className="text-[var(--warn)]">{SIMULATE.distance.before}</span>
                    <span className="mx-2 text-[rgba(215,236,255,.4)]">→</span>
                    <span className="text-[var(--good)]">{SIMULATE.distance.after}</span>
                  </>
                }
              />
              <Readout
                label="CATCHMENT MODEL"
                value={<span className="text-[rgba(215,236,255,.7)]">3.5 KM SERVICE AREA</span>}
              />
            </At>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ═════════════════════════ 10 · EXPLAIN ════════════════════════ */

function Typed({ text, scene, start = 0.05, span = 0.28 }: { text: string; scene: number; start?: number; span?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clamp((clamp(stage.T - scene) - start) / span);
      const n = Math.round(t * text.length);
      if (n !== last && ref.current) {
        last = n;
        ref.current.textContent = text.slice(0, n);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [text, scene, start, span]);
  return <span ref={ref} />;
}

function Evidence() {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const idx = Math.floor(clamp((clamp(stage.T - 10) - 0.42) / 0.4) * EXPLAIN.evidence.length);
      if (idx !== last) {
        last = idx;
        rows.current.forEach((el, i) => {
          if (!el) return;
          const on = i < idx;
          el.style.opacity = on ? "1" : "0.28";
          const dot = el.querySelector<HTMLElement>("[data-d]");
          if (dot) {
            dot.style.background = on ? "var(--cyan)" : "rgba(215,236,255,.25)";
            dot.style.boxShadow = on ? "0 0 10px var(--cyan)" : "none";
          }
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="mt-8 space-y-0">
      {EXPLAIN.evidence.map((e, i) => (
        <div
          key={e.layer}
          ref={(el) => {
            rows.current[i] = el;
          }}
          className="flex items-center gap-3 border-t border-[rgba(215,236,255,.1)] py-3 transition-opacity duration-500"
          style={{ opacity: 0.28 }}
        >
          <span
            data-d
            className="h-1 w-1 rounded-full"
            style={{ background: "rgba(215,236,255,.25)", transition: "all .4s ease" }}
          />
          <span className="ulc-tech">{e.label}</span>
          <span className="ulc-tech-sm ml-auto">SYNCED</span>
        </div>
      ))}
    </div>
  );
}

export function ExplainScene() {
  return (
    <Scene index={10} id="explain" vh={290} scrim="center">
      <div className={`flex h-full items-center ${PAD}`}>
        <div className={`${COL} grid gap-12 lg:grid-cols-[1fr_460px]`}>
          <div className="ulc-drift self-center max-w-[470px]">
            <Display size="d2" lines={EXPLAIN.headline} />
            <Copy className="mt-6">{EXPLAIN.copy}</Copy>
          </div>

          <div className="ulc-drift self-center">
            <div className="ulc-tech-sm">PLANNER</div>
            <div className="ulc-display mt-3 text-[clamp(1rem,1.6vw,1.35rem)] leading-tight">
              <Typed text={EXPLAIN.prompt} scene={10} />
              <span className="ml-1 inline-block h-[1em] w-[2px] translate-y-[2px] bg-[var(--cyan)] align-middle" />
            </div>

            <At scene={10} at={0.34} className="mt-8">
              <div className="ulc-tech-sm text-[var(--cyan)]">URBANLENS</div>
              <p className="mt-3 text-[15px] leading-relaxed text-white">{EXPLAIN.answer}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-[rgba(215,236,255,.62)]">
                {EXPLAIN.detail}
              </p>
            </At>

            <Evidence />
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* ══════════════════════════ 11 · QUIET ═════════════════════════ */

export function QuietScene() {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = clamp(stage.T - 11);
      const second = p > 0.44;
      if (a.current) {
        a.current.style.opacity = second ? "0" : "1";
        a.current.style.transform = second ? "translateY(-16px)" : "none";
      }
      if (b.current) {
        b.current.style.opacity = second ? "1" : "0";
        b.current.style.transform = second ? "none" : "translateY(16px)";
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Scene index={11} vh={260} scrim="center">
      <div className={`flex h-full flex-col items-center justify-center text-center ${PAD}`}>
        <div className="relative flex min-h-[3.2em] items-center justify-center">
          <div
            ref={a}
            style={{ transition: "opacity .7s ease, transform .9s cubic-bezier(.16,1,.3,1)" }}
          >
            <Display size="d2" lines={QUIET.first} />
          </div>
          <div
            ref={b}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity: 0,
              transition: "opacity .7s ease, transform .9s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div className="ulc-display ulc-d2 text-center">
              {QUIET.second.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        <At scene={11} at={0.62} className="mt-16">
          <span className="ulc-tech">{QUIET.journey}</span>
        </At>
      </div>
    </Scene>
  );
}

/* ═══════════════════════ 12 · POSITIONING ══════════════════════ */

export function PositioningScene() {
  return (
    <Scene index={12} vh={250} scrim="center">
      <div className={`flex h-full flex-col items-center justify-center text-center ${PAD}`}>
        <Display size="d2" lines={POSITIONING.first} />
        <At scene={12} at={0.28} className="mt-8 flex flex-col items-center gap-3">
          <span className="h-6 w-px bg-[rgba(22,217,245,0.4)]" aria-hidden />
          <p className="ulc-tech max-w-lg text-[13px] tracking-[0.24em] text-[rgba(226,240,255,0.72)] uppercase sm:text-[14px]">
            {POSITIONING.second.join(" ")}
          </p>
        </At>
      </div>
    </Scene>
  );
}

/* ══════════════════════════ 13 · FINAL ═════════════════════════ */

export function FinalScene() {
  return (
    <Scene index={13} id="launch" vh={220} scrim="center">
      <div className={`flex h-full flex-col items-center justify-center text-center ${PAD}`}>
        <span className="ulc-fade ulc-tech mb-8">{FINAL.eyebrow}</span>
        <Display size="d1" lines={FINAL.headline} />
        <Copy className="mx-auto mt-8 text-center">{FINAL.copy}</Copy>
        <div className="ulc-fade mt-12 flex flex-wrap items-center justify-center gap-3">
          <a href={APP_ROUTE} data-magnetic className="ulc-cta">
            {FINAL.primary} <span aria-hidden>→</span>
          </a>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              if (typeof window !== "undefined") {
                if (window.__lenis) {
                  window.__lenis.scrollTo(0, { duration: 1.5 });
                } else {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
                if (window.location.hash) {
                  window.history.replaceState(null, "", window.location.pathname);
                }
              }
            }}
            data-magnetic
            className="ulc-cta-ghost"
          >
            {FINAL.secondary}
          </a>
        </div>
      </div>
    </Scene>
  );
}

/* ══════════════════════════ FOOTER ════════════════════════════ */

export function Footer() {
  return (
    <footer className={`ulc-footer ${PAD} py-12`}>
      <div className={`${COL} flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between`}>
        <div>
          <div className="ulc-display text-[15px] tracking-[0.16em] text-white">{FOOTER.brand}</div>
          <div className="ulc-tech mt-3 text-[rgba(226,240,255,0.7)]">{FOOTER.line}</div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <span className="ulc-tech-sm tracking-[0.24em] text-[rgba(22,217,245,0.85)]">{FOOTER.place}</span>
        </div>
      </div>
    </footer>
  );
}
