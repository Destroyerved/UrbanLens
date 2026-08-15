"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { OrbitalHeroSection } from "@/components/ui/orbital-hero-section";

// GlobeScene uses WebGL — must be client-only and no SSR
const GlobeScene = dynamic(() => import("@/components/globe/GlobeScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-48 w-48 animate-pulse rounded-full bg-blue-500/10 ring-1 ring-blue-400/20" />
    </div>
  ),
});

function useNarrow(query = "(max-width: 767px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const sync = () => setNarrow(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, [query]);
  return narrow;
}

/* ─── ScrollReveal Helper for Section 3 ─── */
function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 800ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 800ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── CardHoverContainer Helper for Glass Hover & Spotlight Glow ─── */
interface CardHoverContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  isActive: boolean;
  accentRgb: string;
  baseTransform: string;
  hoverScaleMultiplier?: number;
  children: React.ReactNode;
}

function CardHoverContainer({
  isActive,
  accentRgb,
  baseTransform,
  hoverScaleMultiplier = 1.03,
  children,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
  onMouseMove,
  ...props
}: CardHoverContainerProps) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const rafRef = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouch) return;
    if (onMouseMove) onMouseMove(e);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setCoords({ x, y });
    });
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouch) return;
    setIsHovered(true);
    if (onMouseEnter) onMouseEnter(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(false);
    if (onMouseLeave) onMouseLeave(e);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsTouch(true);
    setIsHovered(false);
    if (onTouchStart) onTouchStart(e);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Compute final transform combining auto-cycle + hover scale/rotate
  let finalTransform = baseTransform;
  if (isHovered && !isTouch) {
    finalTransform = `${baseTransform} scale(${hoverScaleMultiplier}) rotate(-1deg)`;
  }

  // Border brightening on hover
  let borderColor = style?.borderColor || "rgba(255, 255, 255, 0.08)";
  if (isHovered && !isTouch) {
    borderColor = `rgba(${accentRgb}, 0.35)`;
  }

  return (
    <div
      {...props}
      className={`group relative overflow-hidden transition-all duration-500 cursor-pointer ${className || ""}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      style={{
        ...style,
        transform: finalTransform,
        borderColor,
      }}
    >
      {/* 1. Ambient Background Glow Blobs (Effect 1) */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-[inherit]">
        {/* Soft ambient blurred glow blob at bottom-left */}
        <div
          className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full blur-[64px]"
          style={{
            background: `radial-gradient(circle, rgba(${accentRgb}, 0.22) 0%, transparent 70%)`,
            opacity: isHovered ? 0.75 : 0.3,
            transform: isHovered ? "scale(1.15)" : "scale(1)",
            transition: "all 700ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        {/* Pinging/pulsing small glow blobs */}
        <div
          className="absolute top-8 left-8 w-12 h-12 rounded-full blur-lg animate-pulse"
          style={{
            backgroundColor: `rgba(${accentRgb}, 0.06)`,
            animationDuration: "3.5s",
          }}
        />
        <div
          className="absolute bottom-12 right-12 w-10 h-10 rounded-full blur-md animate-pulse"
          style={{
            backgroundColor: `rgba(${accentRgb}, 0.06)`,
            animationDuration: "4.5s",
          }}
        />

        {/* 2. Diagonal Shine/Sweep Effect on Hover (Effect 1) */}
        <div
          className="absolute inset-0 transform -skew-x-12 translate-x-full"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.16), transparent)`,
            transform: isHovered ? "skewX(-12deg) translateX(-220%)" : "skewX(-12deg) translateX(120%)",
            transition: isHovered ? "transform 1100ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          }}
        />
      </div>

      {/* 3. Corner Accent Highlights (Effect 1) */}
      <div
        className="absolute top-0 left-0 w-16 h-16 rounded-br-2xl transition-opacity duration-500 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(${accentRgb}, 0.22) 0%, transparent 70%)`,
          opacity: isHovered ? 1 : 0,
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-16 h-16 rounded-tl-2xl transition-opacity duration-500 pointer-events-none"
        style={{
          background: `linear-gradient(315deg, rgba(${accentRgb}, 0.22) 0%, transparent 70%)`,
          opacity: isHovered ? 1 : 0,
        }}
      />

      {/* 4. Cursor-Tracking Spotlight / Border Glow (Effect 2) */}
      <div
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition-opacity duration-300"
        style={{
          opacity: isHovered && !isTouch ? 1 : 0,
          background: `radial-gradient(150px circle at ${coords.x}px ${coords.y}px, rgba(${accentRgb}, 0.45), transparent 65%)`,
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "1.5px",
        } as React.CSSProperties}
      />

      {children}
    </div>
  );
}

/* ─── Domain Cards Data (Section 2) ─── */
const DOMAINS = [
  {
    title: "Urban Planning",
    desc: "Zoning, land-use, and expansion insights for smarter cities.",
    tag: "Zoning Insights",
    color: "from-blue-500/20 to-cyan-500/5",
    border: "border-blue-500/20",
    glow: "shadow-blue-500/10",
  },
  {
    title: "Infrastructure Development",
    desc: "Optimal site selection for roads, power, and public works.",
    tag: "Site Optimization",
    color: "from-teal-500/20 to-emerald-500/5",
    border: "border-teal-500/20",
    glow: "shadow-teal-500/10",
  },
  {
    title: "Environmental Conservation",
    desc: "Flag ecologically sensitive zones before development begins.",
    tag: "Risk Mapping",
    color: "from-emerald-500/20 to-green-500/5",
    border: "border-emerald-500/20",
    glow: "shadow-emerald-500/10",
  },
  {
    title: "Land Governance",
    desc: "Transparent records, encroachment detection, faster registration.",
    tag: "Transparency",
    color: "from-blue-400/20 to-indigo-500/5",
    border: "border-blue-400/20",
    glow: "shadow-blue-400/10",
  },
  {
    title: "Socio-economic Analysis",
    desc: "Correlate land, demographics, and economy for equitable growth.",
    tag: "Equity Insights",
    color: "from-purple-500/20 to-pink-500/5",
    border: "border-purple-500/20",
    glow: "shadow-purple-500/10",
  }
];

const DOMAINS_ICONS = [
  <svg key="up" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-blue-400">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeDasharray="2 2" />
    <path d="M6 18V12h3M12 18V8h3M18 18V14" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>,
  <svg key="id" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-teal-400">
    <circle cx="12" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="18" r="3" />
    <line x1="10.2" y1="8.4" x2="7.8" y2="15.6" />
    <line x1="13.8" y1="8.4" x2="16.2" y2="15.6" />
    <line x1="9" y1="18" x2="15" y2="18" />
  </svg>,
  <svg key="ec" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-emerald-400">
    <path d="M12 2C6.5 2 2 6.5 2 12c0 3.5 1.8 6.6 4.5 8.4l1.5-2.2C6 16.8 5 14.5 5 12c0-3.9 3.1-7 7-7s7 3.1 7 7c0 2.5-1 4.8-3 6.2l1.5 2.2c2.7-1.8 4.5-4.9 4.5-8.4 0-5.5-4.5-10-10-10z" />
    <path d="M12 22V12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  <svg key="lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-blue-300">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 11 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>,
  <svg key="se" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-purple-400">
    <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    <circle cx="6" cy="11" r="2" />
    <circle cx="12" cy="1" r="2" />
    <circle cx="18" cy="7" r="2" />
  </svg>
];

/* ─── Feature cards ─── */
const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M9 20H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h.5" strokeLinecap="round" />
        <path d="M14 7h.5A2 2 0 0 1 17 9v1" strokeLinecap="round" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M12 12v6m-3-3h6" strokeLinecap="round" />
      </svg>
    ),
    title: "GLIS Parcel Intelligence",
    desc: "Analyse 135+ geo-coded parcels across Ahmedabad with land-use history, zoning conflicts, and factor scores — all visualised in real-time.",
    color: "from-blue-500/20 to-cyan-500/5",
    border: "border-blue-500/20",
    glow: "shadow-blue-500/10",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m7 16 4-4 4 4 4-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "2030 Urban Growth Forecast",
    desc: "XGBoost-powered growth probability layers with frontier-distance + road-proximity modelling. Understand tomorrow's city boundaries today.",
    color: "from-violet-500/20 to-purple-500/5",
    border: "border-violet-500/20",
    glow: "shadow-violet-500/10",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3" strokeLinecap="round" />
        <path d="m4.93 4.93 2.12 2.12m9.9 9.9 2.12 2.12m0-14.14-2.12 2.12m-9.9 9.9-2.12 2.12" strokeLinecap="round" />
      </svg>
    ),
    title: "15-Minute City Analyser",
    desc: "Click anywhere on the map to generate a real-time accessibility report. Identify service deserts and underserved communities instantly.",
    color: "from-emerald-500/20 to-teal-500/5",
    border: "border-emerald-500/20",
    glow: "shadow-emerald-500/10",
  },
];

const SIMULATORS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M12 22V12M12 12 8 8m4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="6" r="2"/>
        <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round"/>
      </svg>
    ),
    title: "Smart Site Selection",
    desc: "Define your project type, adjust 6 live weight sliders (accessibility, density, land cost…) and watch candidates re-rank in real-time.",
    color: "from-orange-500/20 to-amber-500/5",
    border: "border-orange-500/20",
    stat: "6 live weights",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "What-If Simulator",
    desc: "Drop a pin, propose an intervention, and watch an expanding coverage ring reveal exactly how many residents gain access.",
    color: "from-pink-500/20 to-rose-500/5",
    border: "border-pink-500/20",
    stat: "Live scenario replay",
  },
];

/* ══════════════════════════════════════════════════════════════
   GLASSMORPHISM LOGIN MODAL
══════════════════════════════════════════════════════════════ */
interface LoginModalProps {
  onClose: () => void;
  onEnterApp: () => void;
}

function LoginModal({ onClose, onEnterApp }: LoginModalProps) {
  const [mode, setMode] = useState<"choose" | "signin" | "signup">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [visible, setVisible] = useState(false);

  // Entrance animation — tiny delay so the transition CSS actually fires
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all duration-200 focus:border-blue-400/60 focus:bg-white/8 focus:ring-1 focus:ring-blue-400/30 autofill:bg-transparent";

  return (
    /* Backdrop — low-opacity so stars remain visible behind */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
      onClick={handleBackdrop}
    >
      {/* Glass card */}
      <div
        className="relative w-full max-w-[420px] mx-4 rounded-2xl p-8"
        style={{
          background: "rgba(8, 14, 28, 0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow:
            "0 0 0 1px rgba(100,160,255,0.06), 0 8px 32px rgba(0,0,0,0.6), 0 0 60px rgba(30,80,200,0.12), 0 0 120px rgba(20,60,160,0.06)",
          transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.96)",
          transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Glass highlight edge — top */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.18) 70%, transparent 100%)",
          }}
        />

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full border border-white/10 text-[13px] text-white/35 transition-all duration-200 hover:border-white/25 hover:bg-white/8 hover:text-white/70"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Logo + heading */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div
            className="mb-4 grid h-11 w-11 place-items-center rounded-2xl"
            style={{
              background: "rgba(60,130,255,0.15)",
              border: "1px solid rgba(100,160,255,0.25)",
              boxShadow: "0 0 20px rgba(60,130,255,0.15)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#60c0ff" strokeWidth={1.5} className="h-5 w-5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <h2 className="text-[1.1rem] font-semibold tracking-tight text-white">
            {mode === "choose" ? "Welcome to UrbanLens" : mode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <p className="mt-1 text-[12px] text-white/40">
            {mode === "choose"
              ? "AI-powered urban intelligence platform"
              : mode === "signin"
              ? "Good to have you back"
              : "Start exploring your city"}
          </p>
        </div>

        {/* ── CHOOSE MODE ── */}
        {mode === "choose" && (
          <div className="flex flex-col gap-2.5">
            {/* Google */}
            <button
              onClick={onEnterApp}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-white/9 hover:text-white"
              style={{ backdropFilter: "blur(4px)" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="ml-auto h-3.5 w-3.5 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60">
                <path d="M3 8h10m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-0.5">
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-[11px] text-white/25">or continue with</span>
              <div className="h-px flex-1 bg-white/8" />
            </div>

            {/* Email sign in */}
            <button
              onClick={() => setMode("signin")}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-white/9 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0 text-white/40">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeLinecap="round"/>
              </svg>
              Sign in with email
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="ml-auto h-3.5 w-3.5 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60">
                <path d="M3 8h10m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Create account */}
            <button
              onClick={() => setMode("signup")}
              className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-blue-300 transition-all duration-200 hover:text-blue-200"
              style={{
                background: "rgba(60,130,255,0.1)",
                border: "1px solid rgba(80,150,255,0.25)",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M19 8v6m3-3h-6" strokeLinecap="round"/>
              </svg>
              Create a new account
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="ml-auto h-3.5 w-3.5 text-blue-400/50 transition group-hover:translate-x-0.5 group-hover:text-blue-300">
                <path d="M3 8h10m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Guest */}
            <div className="pt-1 text-center">
              <button
                onClick={onEnterApp}
                className="text-[12px] text-white/30 underline underline-offset-2 transition hover:text-white/55"
              >
                Continue without an account (Guest)
              </button>
            </div>

            {/* Terms */}
            <p className="mt-1 text-center text-[11px] text-white/20 leading-relaxed">
              By continuing, you agree to our{" "}
              <span className="text-white/40 underline underline-offset-1 cursor-pointer hover:text-white/60">Terms</span>{" "}
              and{" "}
              <span className="text-white/40 underline underline-offset-1 cursor-pointer hover:text-white/60">Privacy Policy</span>
            </p>
          </div>
        )}

        {/* ── SIGN IN FORM ── */}
        {mode === "signin" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-white/50">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[12px] font-medium text-white/50">Password</label>
                <button className="text-[11px] text-blue-400/70 transition hover:text-blue-300">Forgot?</button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>
            <button
              onClick={onEnterApp}
              className="mt-1 w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #0891b2 100%)",
                boxShadow: "0 4px 20px rgba(37,99,235,0.25), 0 1px 0 rgba(255,255,255,0.08) inset",
              }}
            >
              Sign In
            </button>
            <div className="text-center text-[12px] text-white/35">
              Don&apos;t have an account?{" "}
              <button onClick={() => setMode("signup")} className="text-blue-400 transition hover:text-blue-300">
                Sign up
              </button>
            </div>
            <button onClick={() => setMode("choose")} className="text-center text-[11px] text-white/25 transition hover:text-white/50">
              ← All sign-in options
            </button>
          </div>
        )}

        {/* ── SIGN UP FORM ── */}
        {mode === "signup" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-white/50">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-white/50">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-white/50">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className={inputCls}
              />
            </div>
            <button
              onClick={onEnterApp}
              className="mt-1 w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #0891b2 100%)",
                boxShadow: "0 4px 20px rgba(37,99,235,0.25), 0 1px 0 rgba(255,255,255,0.08) inset",
              }}
            >
              Create Account
            </button>
            <div className="text-center text-[12px] text-white/35">
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="text-blue-400 transition hover:text-blue-300">
                Sign in
              </button>
            </div>
            <button onClick={() => setMode("choose")} className="text-center text-[11px] text-white/25 transition hover:text-white/50">
              ← All sign-in options
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
══════════════════════════════════════════════════════════════ */
interface LandingPageProps {
  onEnterApp: () => void;
}

export default function LandingPage({ onEnterApp }: LandingPageProps) {
  const narrow = useNarrow();
  const [isZoomed, setIsZoomed] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const scroll2Ref = useRef<HTMLDivElement>(null);
  const scroll3Ref = useRef<HTMLDivElement>(null);
  const scroll4Ref = useRef<HTMLDivElement>(null);
  const domainsRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const [activeDomain, setActiveDomain] = useState(0);
  const autoCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAutoCycle = () => {
    if (autoCycleRef.current) clearInterval(autoCycleRef.current);
    autoCycleRef.current = setInterval(() => {
      setActiveDomain((prev) => (prev + 1) % 5);
    }, 2000);
  };

  const stopAutoCycle = () => {
    if (autoCycleRef.current) clearInterval(autoCycleRef.current);
  };

  useEffect(() => {
    startAutoCycle();
    return () => {
      stopAutoCycle();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCardInteraction = (index: number) => {
    stopAutoCycle();
    setActiveDomain(index);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Resume auto-cycle after 4 seconds of no interaction
    timerRef.current = setTimeout(() => {
      startAutoCycle();
    }, 4000);
  };

  // ── Scroll 3 (Capability Grid) States ──
  const [activeCap, setActiveCap] = useState(0);
  const capCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [copilotStep, setCopilotStep] = useState(0);
  const [analyticsStep, setAnalyticsStep] = useState(0);
  const [simActive, setSimActive] = useState(false);

  // Hover states for shadow glow hover effects
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [hoveredSim, setHoveredSim] = useState<number | null>(null);
  const [hoveredGap, setHoveredGap] = useState(false);
  const [hoveredTile, setHoveredTile] = useState<number | null>(null);
  const [hoveredStat, setHoveredStat] = useState<number | null>(null);

  const startCapCycle = () => {
    if (capCycleRef.current) clearInterval(capCycleRef.current);
    capCycleRef.current = setInterval(() => {
      setActiveCap((prev) => (prev + 1) % 3);
    }, 4000); // 4 seconds active window per capability card
  };

  const stopCapCycle = () => {
    if (capCycleRef.current) clearInterval(capCycleRef.current);
  };

  useEffect(() => {
    startCapCycle();
    return () => {
      stopCapCycle();
      if (capTimerRef.current) clearTimeout(capTimerRef.current);
    };
  }, []);

  const handleCapInteraction = (index: number) => {
    stopCapCycle();
    setActiveCap(index);
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    // Resume auto-cycle after 5 seconds of inactivity
    capTimerRef.current = setTimeout(() => {
      startCapCycle();
    }, 5000);
  };

  // Staggered Copilot steps inside 4s active window
  useEffect(() => {
    if (activeCap !== 0) {
      setCopilotStep(0);
      return;
    }
    const t1 = setTimeout(() => setCopilotStep(1), 1000); // 1.0s: typing indicator
    const t2 = setTimeout(() => setCopilotStep(2), 2200); // 2.2s: AI response bubble
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activeCap]);

  // Staggered Analytics steps inside 4s active window
  useEffect(() => {
    if (activeCap !== 1) {
      setAnalyticsStep(0);
      return;
    }
    const t1 = setTimeout(() => setAnalyticsStep(1), 1000); // 1.0s: Highlight GJ-0511
    const t2 = setTimeout(() => setAnalyticsStep(2), 2000); // 2.0s: Highlight GJ-0824
    const t3 = setTimeout(() => setAnalyticsStep(3), 3000); // 3.0s: Tooltip "Zoning Analysis complete"
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [activeCap]);

  // Simulator animation trigger inside 4s active window
  useEffect(() => {
    if (activeCap === 2) {
      const t = setTimeout(() => setSimActive(true), 50);
      return () => clearTimeout(t);
    } else {
      setSimActive(false);
    }
  }, [activeCap]);

  // Globe click → camera zoom + trigger parent's fullscreen overlay
  const handleGlobeClick = () => {
    console.log("[LandingPage] Globe clicked");
    setIsZoomed(true);
    // Small RAF delay lets React paint the zoom state before handing off
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onEnterApp(); // page.tsx owns the overlay; this just fires the signal
      });
    });
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden font-sans text-white" style={{ background: '#05070C' }}>

      {/* ═══════════════════════════════════════════════════════════
          SCROLL 1 — HERO
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative h-screen w-full overflow-hidden">

        {/* Stars-only orbital background — NO planet trails */}
        <div className="absolute inset-0 z-0">
          <OrbitalHeroSection
            planets={[]}
            focus={narrow ? [0.5, 0.82] : [0.72, 0.44]}
            scrim={narrow ? "top" : "left"}
            scrimStrength={narrow ? 0.92 : 0.88}
            viewRadius={narrow ? 2.0 : 3.0}
            lead={narrow ? 0.04 : 0.1}
            glow={0.45}
            starCount={700}
            showSunTrack={false}
            showOrbits={false}
          />
        </div>

        {/* Left-side text scrim */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.42) 40%, transparent 64%)",
          }}
        />

        {/* Bottom transition gradient to Scroll 2 background */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-44 z-10"
          style={{
            background: "linear-gradient(to top, #05070C 0%, rgba(5, 7, 12, 0.55) 55%, transparent 100%)",
          }}
        />

        {/* Top navbar */}
        <nav className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-5 md:px-12">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/20 ring-1 ring-blue-400/40">
              <svg viewBox="0 0 24 24" fill="none" stroke="#60c0ff" strokeWidth={1.5} className="h-4 w-4">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">UrbanLens</span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <button onClick={() => scroll2Ref.current?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-white/50 transition hover:text-white/90">Analytics</button>
            <button onClick={() => scroll3Ref.current?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-white/50 transition hover:text-white/90">Simulator</button>
            <button onClick={() => scroll4Ref.current?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-white/50 transition hover:text-white/90">AI Copilot</button>
          </div>

          <button
            onClick={() => setShowLogin(true)}
            className="relative overflow-hidden rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-medium text-white/80 backdrop-blur-sm transition-all duration-300 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-white"
          >
            Login
          </button>
        </nav>

        {/* Hero layout */}
        <div className="absolute inset-0 z-20 flex items-center">
          <div className={`flex w-full items-center ${narrow ? "flex-col justify-end pb-24 px-6" : "flex-row px-12 md:px-16 lg:px-24"}`}>

            {/* Left copy */}
            <div className={`${narrow ? "text-center max-w-sm" : "max-w-lg flex-shrink-0"}`}>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-medium text-blue-300 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                SIH 2026 · PS-SW-001 · Urban Intelligence
              </div>

              <h1 className="text-4xl font-light leading-[1.08] tracking-[-0.03em] text-white md:text-5xl lg:text-[3.5rem]">
                See Your City
                <br />
                <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                  Like Never Before
                </span>
              </h1>

              <p className="mt-5 max-w-sm text-[0.92rem] leading-relaxed text-white/55">
                UrbanLens is an AI-powered urban planning platform — mapping parcels, forecasting growth,
                selecting optimal sites and simulating interventions across Ahmedabad in real-time.
              </p>

              <div className="mt-8 flex gap-6">
                {[
                  { val: "135+", label: "GLIS Parcels" },
                  { val: "2030", label: "Growth Forecast" },
                  { val: "15min", label: "City Analyser" },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col">
                    <span className="text-xl font-semibold text-white">{s.val}</span>
                    <span className="text-[11px] text-white/40">{s.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowLogin(true)}
                  className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:scale-105 hover:shadow-blue-500/40"
                >
                  Get Started
                </button>
                <button
                  onClick={() => scroll2Ref.current?.scrollIntoView({ behavior: "smooth" })}
                  className="rounded-full border border-white/15 px-7 py-3 text-sm text-white/70 backdrop-blur-sm transition hover:border-white/30 hover:text-white"
                >
                  Explore Features ↓
                </button>
              </div>
            </div>

            {/* 3D Globe */}
            {!narrow && (
              <div className="relative ml-16 flex-shrink-0 xl:ml-24">
                <div
                  className={`absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-center text-[11px] text-white/30 transition-all duration-500 ${isZoomed ? "opacity-0" : "opacity-100"}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="animate-bounce">↑</span>
                    Click the globe to enter
                  </span>
                </div>

                <div
                  className={`relative h-[640px] w-[640px] transition-all duration-700 ${
                    isZoomed ? "scale-[1.15] opacity-30" : "scale-100 opacity-100"
                  }`}
                >
                  <GlobeScene isZoomed={isZoomed} setIsZoomed={handleGlobeClick} />
                </div>

                {!isZoomed && (
                  <div
                    className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-blue-400/[0.035]"
                    style={{ animationDuration: "3.5s" }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 z-30 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/30">
          <span className="text-[10px] tracking-widest uppercase">Scroll</span>
          <div className="h-8 w-px bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2 (Scroll 2) — DOMAINS WE SOLVE FOR
      ═══════════════════════════════════════════════════════════ */}
      <section ref={domainsRef} className="relative min-h-screen w-full overflow-hidden px-6 py-24 md:px-12 lg:px-20 flex flex-col justify-center" style={{ background: '#05070C' }}>
        {/* Background gradient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 top-20 h-[500px] w-[500px] rounded-full bg-blue-900/5 blur-[120px]" />
          <div className="absolute -right-40 bottom-20 h-[400px] w-[400px] rounded-full bg-teal-900/5 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl w-full">
          {/* Section header */}
          <div className="mb-16 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/50">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              THE PROBLEM WE SOLVE
            </div>
            <h2 className="text-3xl font-light leading-tight tracking-tight text-white md:text-4xl lg:text-5xl">
              Land Data Exists. Insight Doesn&apos;t
              <br />
              <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">— Until Now.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/45">
              GLIS holds vast geospatial data on land ownership, boundaries, and use — but turning it into decisions planners can act on is still hard. UrbanLens closes that gap.
            </p>
          </div>

          {/* Cards grid (Responsive swipeable carousel on mobile) */}
          <div className="flex md:grid md:grid-cols-5 gap-6 overflow-x-auto md:overflow-x-visible pb-8 md:pb-0 snap-x scrollbar-none scroll-smooth">
            {DOMAINS.map((domain, i) => {
              const isActive = activeDomain === i;
              const isNeighbor = activeDomain !== i;

              let transform = "scale(1)";
              if (isActive) {
                const rotateY = (i - 2) * -3; // dynamic 3D tilt
                transform = `perspective(1000px) rotateX(6deg) rotateY(${rotateY}deg) scale(1.06) translateY(-8px)`;
              } else if (isNeighbor) {
                transform = "scale(0.97)";
              }

              const accentRgb = ["59, 130, 246", "20, 184, 166", "16, 185, 129", "96, 165, 250", "168, 85, 247"][i];

              return (
                <CardHoverContainer
                  key={domain.title}
                  isActive={isActive}
                  accentRgb={accentRgb}
                  baseTransform={transform}
                  hoverScaleMultiplier={1.03}
                  onMouseEnter={() => handleCardInteraction(i)}
                  onTouchStart={() => handleCardInteraction(i)}
                  className="flex-shrink-0 w-[285px] md:w-auto snap-center rounded-2xl border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 shadow-xl"
                  style={{
                    opacity: isActive ? 1 : 0.82,
                    backdropFilter: isActive ? "blur(24px)" : "blur(16px)",
                    WebkitBackdropFilter: isActive ? "blur(24px)" : "blur(16px)",
                    borderColor: isActive ? "rgba(100, 180, 255, 0.4)" : "rgba(255, 255, 255, 0.08)",
                    boxShadow: isActive
                      ? "0 12px 30px rgba(59, 130, 246, 0.15), 0 0 20px rgba(20, 184, 166, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
                      : "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                  }}
                >
                  {/* Glowing background blob when active */}
                  {isActive && (
                    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-500/10 to-teal-500/10 blur-xl animate-pulse" />
                  )}

                  {/* Glass highlight edge — top */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-px"
                    style={{
                      background: isActive
                        ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)"
                        : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
                    }}
                  />

                  <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                    <div>
                      {/* Icon with soft circular glass badge */}
                      <div
                        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300"
                        style={{
                          background: isActive ? "rgba(59, 130, 246, 0.15)" : "rgba(255, 255, 255, 0.05)",
                          border: isActive ? "1px solid rgba(100, 180, 255, 0.3)" : "1px solid rgba(255, 255, 255, 0.1)",
                          boxShadow: isActive ? "0 0 15px rgba(59, 130, 246, 0.2)" : "none",
                        }}
                      >
                        {DOMAINS_ICONS[i]}
                      </div>

                      <h3 className="mb-2 text-sm font-semibold text-white transition-colors duration-300" style={{ color: isActive ? "#93c5fd" : "#ffffff" }}>
                        {domain.title}
                      </h3>
                      <p className="text-[11px] leading-relaxed text-white/50">
                        {domain.desc}
                      </p>
                    </div>

                    <div>
                      {/* Tag chip */}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all duration-300"
                        style={{
                          background: isActive ? "rgba(59, 130, 246, 0.1)" : "rgba(255, 255, 255, 0.03)",
                          borderColor: isActive ? "rgba(100, 180, 255, 0.25)" : "rgba(255, 255, 255, 0.08)",
                          color: isActive ? "#93c5fd" : "rgba(255,255,255,0.5)",
                        }}
                      >
                        <span className="h-1 w-1 rounded-full bg-current" />
                        {domain.tag}
                      </span>
                    </div>
                  </div>
                </CardHoverContainer>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 3 (Scroll 3) — HOW IT WORKS
      ═══════════════════════════════════════════════════════════ */}
      <section ref={howItWorksRef} className="relative min-h-screen w-full overflow-hidden bg-[#02020a] px-6 py-24 md:px-12 lg:px-20 flex flex-col justify-center">
        {/* Background gradient lines */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[1px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute right-0 top-1/4 h-[500px] w-[500px] rounded-full bg-blue-900/5 blur-[120px]" />
          <div className="absolute left-0 bottom-1/4 h-[400px] w-[400px] rounded-full bg-teal-900/5 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl w-full">
          {/* Section header */}
          <div className="mb-16">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/50">
              <span className="h-1 w-1 rounded-full bg-teal-400" />
              THE PLATFORM
            </div>
            <h2 className="text-3xl font-light leading-tight tracking-tight text-white md:text-4xl lg:text-5xl">
              From Raw Data
              <br />
              <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">to Real Decisions</span>
            </h2>
          </div>

          {/* Add CSS @keyframes sweep style overlay */}
          <style>{`
            @keyframes sweep {
              0% { top: 0%; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { top: 100%; opacity: 0; }
            }
          `}</style>

          {/* 3-column Layout with ScrollReveal (Reordered: AI Copilot -> Analytics -> Simulator) */}
          <div className="grid gap-8 md:grid-cols-3 mb-20">
            {/* Column 1: AI Copilot */}
            <ScrollReveal delay={0}>
              <CardHoverContainer
                isActive={activeCap === 0}
                accentRgb="168, 85, 247"
                baseTransform={activeCap === 0 ? "scale(1.12) translateY(-6px)" : "scale(0.93)"}
                hoverScaleMultiplier={1.02}
                onMouseEnter={() => handleCapInteraction(0)}
                onTouchStart={() => handleCapInteraction(0)}
                className="flex flex-col gap-6 p-6 md:p-8 rounded-2xl border"
                style={{
                  opacity: activeCap === 0 ? 1 : 0.65,
                  border: activeCap === 0 ? "1px solid rgba(168, 85, 247, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: activeCap === 0 ? "0 12px 32px rgba(168, 85, 247, 0.15), 0 0 20px rgba(168, 85, 247, 0.1)" : "none",
                  background: activeCap === 0 ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                  backdropFilter: activeCap === 0 ? "blur(24px)" : "blur(12px)",
                  WebkitBackdropFilter: activeCap === 0 ? "blur(24px)" : "blur(12px)",
                }}
              >
                <div>
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 animate-pulse">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">AI Copilot</h3>
                  <p className="text-xs leading-relaxed text-white/55">
                    Ask natural-language questions about land data and get instant, actionable insights.
                  </p>
                </div>

                {/* Styled CSS Mockup browser frame */}
                <div className="w-full rounded-xl border border-white/10 bg-[#06080d]/80 overflow-hidden shadow-2xl shadow-black/85 transition-all duration-300" style={{ backdropFilter: "blur(12px)" }}>
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-[#090b10] border-b border-white/5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-[#27c93f]" />
                    <div className="mx-auto w-1/2 h-3.5 rounded bg-white/5 flex items-center justify-center text-[7px] text-white/35">
                      urbanlens.in/copilot
                    </div>
                  </div>
                  <div className="p-3 bg-[#07090e] min-h-[220px] flex flex-col justify-between">
                    <div className="relative h-full min-h-[160px] rounded border border-white/5 p-3 flex flex-col justify-between bg-black/40">
                      <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[130px] scrollbar-none">
                        {/* User Message - active fade in */}
                        <div className={`flex justify-end transition-all duration-500 ${activeCap === 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
                          <div className="bg-purple-600/15 border border-purple-500/25 text-purple-100 rounded-lg p-2.5 text-[10px] max-w-[85%]">
                            Show high-risk parcels near Vatwa
                          </div>
                        </div>

                        {/* Typing dots */}
                        {activeCap === 0 && copilotStep === 1 && (
                          <div className="flex justify-start">
                            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[9px] text-white/40 flex items-center gap-1">
                              <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        )}

                        {/* AI Response */}
                        <div className={`flex justify-start transition-all duration-500 ${activeCap === 0 && copilotStep === 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
                          <div className="bg-white/5 border border-white/10 text-white/70 rounded-lg p-2.5 text-[10px] max-w-[85%] flex flex-col gap-1.5">
                            <div>Selected 12 parcels inside buffer.</div>
                            <div className="bg-black/55 border border-white/5 rounded p-1 text-[8.5px] text-purple-300 flex justify-between items-center mt-1">
                              <span>GJ-0482 Risk: High</span>
                              <span className="underline scale-90">Locate</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[7.5px] text-white/25 px-0.5">
                        <span>Ask AI Copilot...</span>
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-purple-400">
                          <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHoverContainer>
            </ScrollReveal>

            {/* Column 2: Analytics */}
            <ScrollReveal delay={150}>
              <CardHoverContainer
                isActive={activeCap === 1}
                accentRgb="59, 130, 246"
                baseTransform={activeCap === 1 ? "scale(1.12) translateY(-6px)" : "scale(0.93)"}
                hoverScaleMultiplier={1.02}
                onMouseEnter={() => handleCapInteraction(1)}
                onTouchStart={() => handleCapInteraction(1)}
                className="flex flex-col gap-6 p-6 md:p-8 rounded-2xl border"
                style={{
                  opacity: activeCap === 1 ? 1 : 0.65,
                  border: activeCap === 1 ? "1px solid rgba(59, 130, 246, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: activeCap === 1 ? "0 12px 32px rgba(59, 130, 246, 0.15), 0 0 20px rgba(59, 130, 246, 0.1)" : "none",
                  background: activeCap === 1 ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                  backdropFilter: activeCap === 1 ? "blur(24px)" : "blur(12px)",
                  WebkitBackdropFilter: activeCap === 1 ? "blur(24px)" : "blur(12px)",
                }}
              >
                <div>
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 animate-pulse">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Analytics</h3>
                  <p className="text-xs leading-relaxed text-white/55">
                    Visualize parcels, ownership, and land-use patterns on an interactive map.
                  </p>
                </div>

                {/* Styled CSS Mockup browser frame */}
                <div className="w-full rounded-xl border border-white/10 bg-[#06080d]/80 overflow-hidden shadow-2xl shadow-black/85 transition-all duration-300" style={{ backdropFilter: "blur(12px)" }}>
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-[#090b10] border-b border-white/5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-[#27c93f]" />
                    <div className="mx-auto w-1/2 h-3.5 rounded bg-white/5 flex items-center justify-center text-[7px] text-white/35">
                      urbanlens.in/analytics
                    </div>
                  </div>
                  <div className="p-3 bg-[#07090e] min-h-[220px] flex flex-col justify-between">
                    <div className="flex-1 bg-gradient-to-br from-[#0c1017] to-[#080b0f] relative overflow-hidden rounded border border-white/5 min-h-[160px] p-2 bg-black/40">
                      <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:10px_10px]" />
                      
                      {/* CSS scanning line sweep */}
                      {activeCap === 1 && (
                        <div 
                          className="absolute inset-x-0 h-0.5 bg-blue-500/60 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          style={{
                            animation: "sweep 3.5s ease-in-out infinite",
                            position: "absolute",
                          }}
                        />
                      )}
                      
                      {/* Stylized polygon parcels */}
                      <div 
                        className="absolute top-4 left-4 w-14 h-9 border rounded transform rotate-12 flex items-center justify-center text-[7px] transition-all duration-350"
                        style={{
                          backgroundColor: activeCap === 1 ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.1)",
                          borderColor: activeCap === 1 ? "rgba(59, 130, 246, 0.6)" : "rgba(59, 130, 246, 0.2)",
                          color: activeCap === 1 ? "#93c5fd" : "rgba(255,255,255,0.4)"
                        }}
                      >
                        GJ-0482
                      </div>
                      
                      <div 
                        className="absolute top-12 right-4 w-12 h-12 border rounded-full flex items-center justify-center text-[7px] transition-all duration-350"
                        style={{
                          backgroundColor: activeCap === 1 && analyticsStep >= 1 ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.1)",
                          borderColor: activeCap === 1 && analyticsStep >= 1 ? "rgba(16, 185, 129, 0.6)" : "rgba(16, 185, 129, 0.2)",
                          color: activeCap === 1 && analyticsStep >= 1 ? "#34d399" : "rgba(255,255,255,0.4)"
                        }}
                      >
                        GJ-0511
                      </div>

                      <div 
                        className="absolute bottom-4 left-8 w-18 h-7 border rounded transform -rotate-6 flex items-center justify-center text-[7px] transition-all duration-350"
                        style={{
                          backgroundColor: activeCap === 1 && analyticsStep >= 2 ? "rgba(168, 85, 247, 0.25)" : "rgba(168, 85, 247, 0.1)",
                          borderColor: activeCap === 1 && analyticsStep >= 2 ? "rgba(168, 85, 247, 0.6)" : "rgba(168, 85, 247, 0.2)",
                          color: activeCap === 1 && analyticsStep >= 2 ? "#c084fc" : "rgba(255,255,255,0.4)"
                        }}
                      >
                        GJ-0824
                      </div>
                      
                      {/* Tooltip popping up */}
                      <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/85 border border-blue-500/40 rounded-lg px-2.5 py-1 text-[8.5px] text-blue-300 transition-all duration-500 whitespace-nowrap shadow-lg shadow-black"
                        style={{
                          opacity: activeCap === 1 && analyticsStep === 3 ? 1 : 0,
                          transform: activeCap === 1 && analyticsStep === 3 ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -40%) scale(0.9)"
                        }}
                      >
                        Zoning Analysis: Complete (100%)
                      </div>

                      {/* Legend overlay */}
                      <div className="absolute bottom-1.5 right-1.5 bg-black/75 border border-white/10 rounded px-1.5 py-0.5 text-[5px] flex flex-col gap-0.5">
                        <div className="flex items-center gap-0.5"><span className="w-1 h-1 bg-blue-500 rounded-full" />Residential</div>
                        <div className="flex items-center gap-0.5"><span className="w-1 h-1 bg-emerald-500 rounded-full" />Conservation</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHoverContainer>
            </ScrollReveal>

            {/* Column 3: Simulator */}
            <ScrollReveal delay={300}>
              <CardHoverContainer
                isActive={activeCap === 2}
                accentRgb="20, 184, 166"
                baseTransform={activeCap === 2 ? "scale(1.12) translateY(-6px)" : "scale(0.93)"}
                hoverScaleMultiplier={1.02}
                onMouseEnter={() => handleCapInteraction(2)}
                onTouchStart={() => handleCapInteraction(2)}
                className="flex flex-col gap-6 p-6 md:p-8 rounded-2xl border"
                style={{
                  opacity: activeCap === 2 ? 1 : 0.65,
                  border: activeCap === 2 ? "1px solid rgba(20, 184, 166, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: activeCap === 2 ? "0 12px 32px rgba(20, 184, 166, 0.15), 0 0 20px rgba(20, 184, 166, 0.1)" : "none",
                  background: activeCap === 2 ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                  backdropFilter: activeCap === 2 ? "blur(24px)" : "blur(12px)",
                  WebkitBackdropFilter: activeCap === 2 ? "blur(24px)" : "blur(12px)",
                }}
              >
                <div>
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 animate-pulse">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                      <path d="M12 22v-6m-4-4v-4m8 8V6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Simulator</h3>
                  <p className="text-xs leading-relaxed text-white/55">
                    Model what-if scenarios — rezoning, new roads, infrastructure impact — before committing resources.
                  </p>
                </div>

                {/* Styled CSS Mockup browser frame */}
                <div className="w-full rounded-xl border border-white/10 bg-[#06080d]/80 overflow-hidden shadow-2xl shadow-black/85 transition-all duration-300" style={{ backdropFilter: "blur(12px)" }}>
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-[#090b10] border-b border-white/5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-[#27c93f]" />
                    <div className="mx-auto w-1/2 h-3.5 rounded bg-white/5 flex items-center justify-center text-[7px] text-white/35">
                      urbanlens.in/simulator
                    </div>
                  </div>
                  <div className="p-3 bg-[#07090e] min-h-[220px] flex flex-col justify-between">
                    <div className="relative h-full min-h-[160px] rounded border border-white/5 p-3 flex flex-col justify-between bg-black/40">
                      <div className="flex flex-col gap-2.5">
                        {/* Sliders */}
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[8px] text-white/50">
                            <span>Accessibility</span>
                            <span className="text-teal-400 font-semibold">{simActive ? "75%" : "0%"}</span>
                          </div>
                          <div className="h-1 w-full bg-white/5 rounded-full relative">
                            <div 
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-teal-500 rounded-full"
                              style={{ 
                                width: simActive ? "75%" : "0%",
                                transition: simActive ? "width 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "width 0s"
                              }} 
                            />
                            <div 
                              className="absolute w-2 h-2 bg-white border border-blue-500 rounded-full -top-0.5" 
                              style={{ 
                                left: simActive ? "75%" : "0%", 
                                transform: "translateX(-50%)",
                                transition: simActive ? "left 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "left 0s"
                              }} 
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[8px] text-white/50">
                            <span>Land Cost</span>
                            <span className="text-teal-400 font-semibold">{simActive ? "40%" : "0%"}</span>
                          </div>
                          <div className="h-1 w-full bg-white/5 rounded-full relative">
                            <div 
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-teal-500 rounded-full"
                              style={{ 
                                width: simActive ? "40%" : "0%",
                                transition: simActive ? "width 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "width 0s"
                              }} 
                            />
                            <div 
                              className="absolute w-2 h-2 bg-white border border-blue-500 rounded-full -top-0.5" 
                              style={{ 
                                left: simActive ? "40%" : "0%", 
                                transform: "translateX(-50%)",
                                transition: simActive ? "left 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "left 0s"
                              }} 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Bar chart rankings */}
                      <div className="border-t border-white/5 pt-2 mt-2 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-[8px]">
                          <span className="text-white/60">Vatwa Candidate</span>
                          <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full" 
                              style={{ 
                                width: simActive ? "88%" : "0%",
                                transition: simActive ? "width 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "width 0s"
                              }} 
                            />
                          </div>
                          <span className="text-emerald-400 font-semibold">{simActive ? "88%" : "0%"}</span>
                        </div>

                        <div className="flex justify-between items-center text-[8px]">
                          <span className="text-white/60">Nikol Candidate</span>
                          <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full" 
                              style={{ 
                                width: simActive ? "72%" : "0%",
                                transition: simActive ? "width 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "width 0s"
                              }} 
                            />
                          </div>
                          <span className="text-blue-400 font-semibold">{simActive ? "72%" : "0%"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHoverContainer>
            </ScrollReveal>
          </div>

          {/* Closing CTA band */}
          <div className="border-t border-white/5 pt-12 text-center flex flex-col items-center gap-6">
            <p className="text-xs text-white/55 max-w-lg leading-relaxed">
              Built for planners, policymakers, and citizens who want to see the city clearly.
            </p>
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40 hover:scale-105"
            >
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SCROLL 2 — CORE ANALYTICS
      ═══════════════════════════════════════════════════════════ */}
      <section ref={scroll2Ref} className="relative min-h-screen w-full overflow-hidden px-6 py-24 md:px-12 lg:px-20" style={{ background: '#05070C' }}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 top-20 h-[500px] w-[500px] rounded-full bg-blue-600/5 blur-[120px]" />
          <div className="absolute -right-40 bottom-20 h-[400px] w-[400px] rounded-full bg-violet-600/5 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/50">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Intelligence Engine
            </div>
            <h2 className="text-3xl font-light leading-tight tracking-tight text-white md:text-4xl lg:text-5xl">
              Every decision backed
              <br />
              <span className="text-white/40">by spatial intelligence</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/45">
              Six interlinked analytics modules run on deterministic seeded data over Ahmedabad&apos;s 12 wards,
              135 parcels and 55+ facilities — ready to swap to live APIs.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f, i) => {
              const isHovered = hoveredFeature === i;
              const accentRgb = [
                "59, 130, 246",
                "139, 92, 246",
                "16, 185, 129"
              ][i];

              return (
                <div
                  key={f.title}
                  onMouseEnter={() => setHoveredFeature(i)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  onTouchStart={() => setHoveredFeature(i)}
                  onTouchEnd={() => setHoveredFeature(null)}
                  className={`group relative overflow-hidden rounded-2xl border ${f.border} bg-gradient-to-b ${f.color} p-6 transition-all duration-500 hover:-translate-y-1 cursor-pointer`}
                  style={{
                    borderColor: isHovered ? `rgba(${accentRgb}, 0.35)` : undefined,
                    boxShadow: isHovered
                      ? `0 12px 30px rgba(0,0,0,0.7), 0 0 25px rgba(${accentRgb}, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)`
                      : `0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(${accentRgb}, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
                  }}
                >
                  {/* Soft ambient glow blob behind the card */}
                  <div
                    className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full blur-[60px] pointer-events-none transition-all duration-500"
                    style={{
                      background: `radial-gradient(circle, rgba(${accentRgb}, 0.4) 0%, transparent 70%)`,
                      opacity: isHovered ? 0.8 : 0.25,
                      transform: isHovered ? "scale(1.2)" : "scale(1)",
                    }}
                  />
                  
                  <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-white/5 blur-xl transition-all duration-500 group-hover:scale-150 group-hover:bg-white/10" />
                  <div className="relative z-10">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70">{f.icon}</div>
                    <h3 className="mb-2 text-base font-semibold text-white">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-white/50">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              { val: "12", label: "City Wards", sub: "Ahmedabad AMC grid" },
              { val: "55+", label: "Facilities Mapped", sub: "Hospitals, schools, transit" },
              { val: "530", label: "Grid Cells", sub: "Population density layer" },
              { val: "100%", label: "Deterministic", sub: "Reproducible results" },
            ].map((m, i) => {
              const isHovered = hoveredStat === i;
              const accentRgb = "59, 130, 246"; // Blue theme

              return (
                <div
                  key={m.label}
                  onMouseEnter={() => setHoveredStat(i)}
                  onMouseLeave={() => setHoveredStat(null)}
                  onTouchStart={() => setHoveredStat(i)}
                  onTouchEnd={() => setHoveredStat(null)}
                  className="rounded-xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm relative overflow-hidden transition-all duration-500 cursor-pointer"
                  style={{
                    borderColor: isHovered ? `rgba(${accentRgb}, 0.25)` : undefined,
                    boxShadow: isHovered
                      ? `0 0 15px rgba(${accentRgb}, 0.15), 0 4px 12px rgba(0,0,0,0.5)`
                      : undefined,
                  }}
                >
                  {/* Faint ambient glow blob */}
                  <div
                    className="absolute -bottom-8 -left-8 w-20 h-20 rounded-full blur-[30px] pointer-events-none transition-all duration-500"
                    style={{
                      background: `radial-gradient(circle, rgba(${accentRgb}, 0.3) 0%, transparent 70%)`,
                      opacity: isHovered ? 0.6 : 0.15,
                    }}
                  />
                  <div className="relative z-10">
                    <div className="text-2xl font-light text-white">{m.val}</div>
                    <div className="mt-1 text-xs font-medium text-white/60">{m.label}</div>
                    <div className="mt-0.5 text-[11px] text-white/30">{m.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SCROLL 3 — SIMULATORS
      ═══════════════════════════════════════════════════════════ */}
      <section ref={scroll3Ref} className="relative min-h-screen w-full overflow-hidden px-6 py-24 md:px-12 lg:px-20" style={{ background: '#05070C' }}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[1px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute right-0 top-1/3 h-[600px] w-[600px] rounded-full bg-orange-600/4 blur-[140px]" />
          <div className="absolute -left-20 bottom-0 h-[400px] w-[400px] rounded-full bg-pink-600/4 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="mb-16 max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/50">
              <span className="h-1 w-1 rounded-full bg-orange-400" />
              Simulation Suite
            </div>
            <h2 className="text-3xl font-light leading-tight tracking-tight text-white md:text-4xl lg:text-5xl">
              Simulate before<br /><span className="text-white/40">you build</span>
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-white/45">
              Test real-world urban interventions — select optimal sites for hospitals, schools and transit
              hubs, then run what-if scenarios to measure livability impact before a single brick is laid.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {SIMULATORS.map((s, i) => {
              const isHovered = hoveredSim === i;
              const accentRgb = i === 0 ? "249, 115, 22" : "236, 72, 153";

              return (
                <div
                  key={s.title}
                  onMouseEnter={() => setHoveredSim(i)}
                  onMouseLeave={() => setHoveredSim(null)}
                  onTouchStart={() => setHoveredSim(i)}
                  onTouchEnd={() => setHoveredSim(null)}
                  className={`group relative overflow-hidden rounded-2xl border ${s.border} bg-gradient-to-b ${s.color} p-8 transition-all duration-500 hover:-translate-y-1 cursor-pointer`}
                  style={{
                    borderColor: isHovered ? `rgba(${accentRgb}, 0.35)` : undefined,
                    boxShadow: isHovered
                      ? `0 12px 30px rgba(0,0,0,0.7), 0 0 25px rgba(${accentRgb}, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)`
                      : `0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(${accentRgb}, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
                  }}
                >
                  {/* Soft ambient glow blob behind the card */}
                  <div
                    className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full blur-[64px] pointer-events-none transition-all duration-500"
                    style={{
                      background: `radial-gradient(circle, rgba(${accentRgb}, 0.4) 0%, transparent 70%)`,
                      opacity: isHovered ? 0.8 : 0.25,
                      transform: isHovered ? "scale(1.2)" : "scale(1)",
                    }}
                  />

                  <div className="absolute right-0 top-0 h-40 w-40 rounded-bl-full bg-white/[0.02] transition-all duration-500 group-hover:bg-white/[0.04]" />
                  <div className="relative z-10">
                    <div className="mb-5 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-3 text-white/70">{s.icon}</div>
                    <h3 className="mb-3 text-lg font-semibold text-white">{s.title}</h3>
                    <p className="mb-5 text-sm leading-relaxed text-white/50">{s.desc}</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                      <span className="h-1 w-1 rounded-full bg-current" />{s.stat}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            onMouseEnter={() => setHoveredGap(true)}
            onMouseLeave={() => setHoveredGap(false)}
            onTouchStart={() => setHoveredGap(true)}
            onTouchEnd={() => setHoveredGap(false)}
            className="mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-8 relative overflow-hidden transition-all duration-500 cursor-pointer"
            style={{
              borderColor: hoveredGap ? "rgba(245, 158, 11, 0.35)" : undefined,
              boxShadow: hoveredGap
                ? "0 12px 30px rgba(0,0,0,0.7), 0 0 25px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
                : undefined,
            }}
          >
            {/* Soft ambient glow blob behind the card */}
            <div
              className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full blur-[64px] pointer-events-none transition-all duration-500"
              style={{
                background: "radial-gradient(circle, rgba(245, 158, 11, 0.3) 0%, transparent 70%)",
                opacity: hoveredGap ? 0.8 : 0.15,
                transform: hoveredGap ? "scale(1.2)" : "scale(1)",
              }}
            />

            <div className="grid gap-8 md:grid-cols-2 md:items-center relative z-10">
              <div>
                <h3 className="mb-3 text-xl font-light text-white">Infrastructure Gap Analysis</h3>
                <p className="text-sm leading-relaxed text-white/50">
                  Automatically scores all 12 wards across 5 infrastructure categories. Identifies the most
                  underserved communities by affected population count.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 relative z-10">
                {["Healthcare", "Education", "Transport", "Green Space"].map((cat, i) => {
                  const isHovered = hoveredTile === i;
                  const accentRgb = "245, 158, 11"; // Amber theme

                  return (
                    <div
                      key={cat}
                      onMouseEnter={() => setHoveredTile(i)}
                      onMouseLeave={() => setHoveredTile(null)}
                      onTouchStart={() => setHoveredTile(i)}
                      onTouchEnd={() => setHoveredTile(null)}
                      className="rounded-lg border border-white/8 bg-white/[0.03] p-4 relative overflow-hidden transition-all duration-500 cursor-pointer"
                      style={{
                        borderColor: isHovered ? `rgba(${accentRgb}, 0.25)` : undefined,
                        boxShadow: isHovered
                          ? `0 0 12px rgba(${accentRgb}, 0.12), 0 2px 8px rgba(0,0,0,0.5)`
                          : undefined,
                      }}
                    >
                      {/* Faint ambient glow blob inside tile */}
                      <div
                        className="absolute -bottom-8 -left-8 w-16 h-16 rounded-full blur-[24px] pointer-events-none transition-all duration-500"
                        style={{
                          background: `radial-gradient(circle, rgba(${accentRgb}, 0.25) 0%, transparent 70%)`,
                          opacity: isHovered ? 0.6 : 0.15,
                        }}
                      />
                      <div className="relative z-10">
                        <div className="mb-2 h-1 w-full rounded-full bg-white/5 relative">
                          <div
                            className="h-1 rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-500"
                            style={{
                              width: `${[72, 58, 84, 44][i]}%`,
                              boxShadow: isHovered
                                ? "0 0 8px rgba(245, 158, 11, 0.8)"
                                : "none",
                            }}
                          />
                        </div>
                        <div className="text-[11px] text-white/40">{cat}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SCROLL 4 — AI COPILOT + FOOTER
      ═══════════════════════════════════════════════════════════ */}
      <section ref={scroll4Ref} className="relative w-full overflow-hidden px-6 pb-0 pt-24 md:px-12 lg:px-20" style={{ background: '#05070C' }}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[1px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute left-1/2 top-1/3 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/5 blur-[160px]" />
        </div>

        <div className="relative mx-auto max-w-6xl pb-20">
          <div className="mb-20 grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs text-violet-300">
                <span className="h-1 w-1 animate-pulse rounded-full bg-violet-400" />
                AI-Powered · Natural Language
              </div>
              <h2 className="mb-5 text-3xl font-light leading-tight tracking-tight text-white md:text-4xl">
                Ask anything about<br /><span className="text-white/40">your city</span>
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-white/50">
                The AI Copilot understands spatial intent — ask &ldquo;show me underserved areas near Maninagar&rdquo;
                and it flies the map there, highlights the right wards, and surfaces a ranked answer.
              </p>
              <ul className="space-y-3">
                {[
                  "Natural language → map actions",
                  "Fly-to, highlight wards, switch analysis modes",
                  "Deterministic answers, never hallucinates numbers",
                  "Pattern-matching today, LLM layer when backend lands",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/50">
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 text-center text-[9px] leading-4 text-violet-400">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowLogin(true)}
                className="mt-8 group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:scale-105 hover:shadow-violet-500/40"
              >
                Try it now
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition-transform group-hover:translate-x-1">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-2.5 border-b border-white/8 pb-4">
                <div className="h-2.5 w-2.5 rounded-full bg-violet-400" />
                <span className="text-xs font-medium text-white/60">UrbanLens AI Copilot</span>
              </div>
              <div className="space-y-4">
                {[
                  { role: "user", msg: "Which ward has the worst healthcare gap?" },
                  { role: "ai", msg: "Ward 7 (Vatwa) has the lowest healthcare score — 1 clinic serving ~18,400 residents. Highlighting it on the map and switching to Infrastructure Gap mode." },
                  { role: "user", msg: "What's the best site for a new primary health centre?" },
                  { role: "ai", msg: "Top candidate: Parcel GJ-AHD-0847 in Vatwa. Score 87/100 — high accessibility, vacant land, within 500m of the underserved population centroid." },
                ].map((item, i) => (
                  <div key={i} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${item.role === "user" ? "bg-violet-600/20 text-violet-100" : "border border-white/8 bg-white/5 text-white/60"}`}>
                      {item.msg}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="flex-1 text-xs text-white/25">Ask about your city…</span>
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-violet-400">
                  <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <footer className="relative border-t border-white/8 py-10">
          <div className="mx-auto max-w-6xl flex flex-col items-center gap-4 md:flex-row md:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-md bg-blue-500/20 ring-1 ring-blue-400/30">
                <svg viewBox="0 0 24 24" fill="none" stroke="#60c0ff" strokeWidth={1.5} className="h-3.5 w-3.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <span className="text-xs font-medium text-white/50">UrbanLens · SIH 2026</span>
            </div>
            <div className="text-[11px] text-white/25">
              Demo / synthetic data — NOT an official government or GLIS legal record
            </div>
            <div className="flex items-center gap-6">
              <button onClick={() => setShowLogin(true)} className="text-xs text-white/40 transition hover:text-white/70">Login</button>
              <a href="#" className="text-xs text-white/40 transition hover:text-white/70">Docs</a>
              <a href="#" className="text-xs text-white/40 transition hover:text-white/70">GitHub</a>
            </div>
          </div>
        </footer>
      </section>

      {/* Login Modal */}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onEnterApp={() => {
            setShowLogin(false);
            handleGlobeClick();
          }}
        />
      )}
    </div>
  );
}
