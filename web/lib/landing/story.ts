/**
 * UrbanLens — cinematic landing narrative.
 *
 * Every string and figure the landing page shows lives here. Figures come from
 * the UrbanLens PRD demo scenario (§9, §13, §17–20, §26) — nothing on the page
 * is generated at random. The spatial geometry the scenes draw is the app's own
 * demo dataset (`@/data/*`), which is deterministic and clearly labelled as
 * illustrative rather than official GLIS data.
 */

export const DATA_NOTE =
  "Modelled across Gujarat — not an official GLIS record.";

export const CITY = {
  name: "GUJARAT",
  region: "INDIA",
  /** Gujarat geographic center */
  center: [71.1924, 22.2587] as [number, number],
  lat: 22.2587,
  lng: 71.1924,
};

/* ─────────────────────────── 00 · HERO ─────────────────────────── */

export const HERO = {
  eyebrowLeft: "URBANLENS",
  eyebrowRight: "URBAN INTELLIGENCE",
  headline: ["THE INTELLIGENCE", "TO BUILD", "BETTER CITIES"],
  micro: "AI-POWERED URBAN PLANNING & LAND INTELLIGENCE",
  scroll: "SCROLL TO EXPLORE",
};

/* ───────────────────────── 01 · PROBLEM ────────────────────────── */

export const PROBLEM = {
  headline: ["CITIES ARE", "CHANGING", "FASTER THAN EVER"],
  copy: "Urban growth reshapes land, infrastructure and public services long before traditional planning systems can respond.",
};

/* ───────────────────────── 02 · METRICS ────────────────────────── */

export const METRICS = [
  { value: "+35%", label: "BUILT-UP GROWTH SINCE 2018" },
  { value: "70.4M", label: "GUJARAT POPULATION" },
  { value: "1.0M", label: "RESIDENTS BEYOND IDEAL HOSPITAL REACH" },
  { value: "2,567", label: "GLIS PARCELS ANALYZED" },
  { value: "19 ha", label: "VACANT GOVERNMENT LAND IDENTIFIED" },
] as const;

/* ────────────────────────── 03 · LOCATE ────────────────────────── */

export const LOCATE = {
  steps: ["INDIA", "ALL GUJARAT"],
  coords: "22.2587° N · 71.1924° E",
  note: "",
};

/* ───────────────────────── 04 · OBSERVE ────────────────────────── */

export const OBSERVE = {
  chapter: "01 · OBSERVE",
  headline: ["SEE HOW", "THE CITY", "HAS CHANGED"],
  copy: "UrbanLens combines land records and satellite observations to reveal urban expansion over time.",
  years: [2018, 2022, 2026] as const,
  builtUpKm2: { 2018: 321, 2022: 378, 2026: 426 } as Record<number, number>,
  growth: "+32.7%",
  growthLabel: "BUILT-UP AREA GROWTH",
  growthRange: "2018 → 2026",
  /** wireframe → texture resolve order (PRD §38) */
  resolve: ["GEOGRAPHIC GRID", "ROADS", "WARDS", "PARCELS", "SATELLITE"],
};

/* ───────────────────────── 05 · PREDICT ────────────────────────── */

export const PREDICT = {
  chapter: "02 · PREDICT",
  headline: ["SEE WHAT", "COMES NEXT"],
  copy: "UrbanLens models where future expansion pressure is most likely to occur.",
  title: "2030 GROWTH PREDICTION",
  value: "84%",
  valueLabel: "DEVELOPMENT PRESSURE",
  place: "EASTERN INDUSTRIAL CORRIDOR",
  bands: [
    { label: "VERY HIGH", range: "80–100", color: "#FF4F5D" },
    { label: "HIGH", range: "60–80", color: "#FF9500" },
    { label: "MEDIUM", range: "40–60", color: "#E9C46A" },
    { label: "LOW", range: "20–40", color: "#6E839B" },
  ],
};

/* ──────────────────────── 06 · UNDERSTAND ──────────────────────── */

export const UNDERSTAND = {
  chapter: "03 · UNDERSTAND",
  headline: ["GROWTH", "IS ONLY HALF", "THE STORY"],
  copy: "Development creates new demand for hospitals, schools, parks, transport and public services.",
  stats: [
    { value: "1.0M", label: "RESIDENTS BEYOND IDEAL HOSPITAL REACH" },
    { value: "7", label: "WARDS BELOW INFRASTRUCTURE BASELINE" },
  ],
  radiusKm: 3.5,
};

/* ───────────────────────── 07 · IDENTIFY ───────────────────────── */

export const IDENTIFY = {
  chapter: "04 · IDENTIFY",
  headline: ["FIND THE LAND", "THAT CAN", "CHANGE THE CITY"],
  copy: "UrbanLens connects infrastructure need with available and suitable government land.",
  /** Applied in order against the demo parcel table — counts are computed live. */
  filters: [
    { key: "gov", label: "GOVERNMENT OWNED" },
    { key: "area", label: "SUFFICIENT AREA" },
    { key: "road", label: "ROAD ACCESS" },
    { key: "need", label: "HIGH POPULATION NEED" },
    { key: "flood", label: "LOW FLOOD RISK" },
    { key: "env", label: "LOW ENVIRONMENTAL CONSTRAINT" },
  ] as const,
};

/* ──────────────────────── 08 · RECOMMEND ───────────────────────── */

export const RECOMMEND = {
  chapter: "05 · RECOMMEND",
  headline: ["FIND THE", "RIGHT PLACE", "TO BUILD"],
  title: "BEST SITE FOR NEW HOSPITAL",
  parcelId: "GJ-AHD-1028",
  score: "94",
  scoreOutOf: "/ 100",
  factors: [
    { label: "ACCESSIBILITY", value: 94 },
    { label: "POPULATION NEED", value: 88 },
    { label: "TRANSIT", value: 91 },
    { label: "INFRASTRUCTURE", value: 78 },
    { label: "ENVIRONMENT", value: 86 },
    { label: "LAND COMPATIBILITY", value: 97 },
  ],
  whyTitle: "WHY THIS SITE?",
  why: [
    "Government-owned land",
    "Strong road connectivity",
    "48,000 underserved residents nearby",
    "Low flood exposure",
    "Suitable parcel size",
    "Compatible planning conditions",
  ],
};

/* ───────────────────────── 09 · SIMULATE ───────────────────────── */

export const SIMULATE = {
  chapter: "06 · SIMULATE",
  headline: ["SEE THE IMPACT", "BEFORE", "YOU BUILD"],
  before: { tag: "BEFORE", value: "64%", label: "HEALTHCARE COVERAGE" },
  after: { tag: "AFTER", value: "88%", label: "HEALTHCARE COVERAGE" },
  newly: { value: "+46,800", label: "RESIDENTS NEWLY COVERED" },
  distance: { before: "5.8 km", after: "2.9 km", label: "AVERAGE HOSPITAL DISTANCE" },
};

/* ────────────────────────── 10 · EXPLAIN ───────────────────────── */

export const EXPLAIN = {
  chapter: "07 · EXPLAIN",
  headline: ["EVERY DECISION", "SHOULD HAVE", "A REASON"],
  copy: "UrbanLens explains the spatial evidence behind every recommendation.",
  prompt: "WHERE SHOULD GUJARAT PRIORITIZE NEW HEALTHCARE INFRASTRUCTURE?",
  answer:
    "Parcel GJ-AHD-1028 ranks first with a 94/100 suitability score.",
  detail:
    "It combines government ownership, strong road access, high nearby population need and low environmental risk.",
  /** each evidence line lights a matching map layer as it appears */
  evidence: [
    { label: "GOVERNMENT PARCELS", layer: "gov" },
    { label: "ROAD NETWORK", layer: "roads" },
    { label: "POPULATION NEED", layer: "population" },
    { label: "ENVIRONMENTAL RISK", layer: "environment" },
  ] as const,
};

/* ─────────────────────────── 11 · QUIET ────────────────────────── */

export const QUIET = {
  first: ["DATA SHOWS", "WHAT EXISTS."],
  second: ["URBANLENS SHOWS", "WHAT TO DO NEXT."],
  journey: "SEE → UNDERSTAND → PREDICT → PLAN → SIMULATE → DECIDE",
};

/* ──────────────────────── 12 · POSITIONING ─────────────────────── */

export const POSITIONING = {
  first: ["MORE THAN", "A MAP."],
  second: ["A STATE-SCALE", "DECISION", "INTELLIGENCE SYSTEM."],
  copy: "UrbanLens transforms geospatial data into observation, analysis, prediction, recommendation and simulation.",
};

/* ─────────────────────────── 13 · FINAL ────────────────────────── */

export const FINAL = {
  eyebrow: "URBANLENS",
  headline: ["BETTER CITIES", "BEGIN WITH", "BETTER DECISIONS."],
  copy: "AI-powered urban planning and land intelligence.",
  primary: "ENTER URBANLENS",
  secondary: "EXPLORE PLATFORM",
};

export const FOOTER = {
  brand: "URBANLENS",
  line: "SPATIAL INTELLIGENCE FOR BETTER CITIES",
  place: "GUJARAT · INDIA",
};

export const NAV = [
  { label: "OVERVIEW", href: "#top" },
  { label: "GROWTH", href: "#observe" },
  { label: "INFRASTRUCTURE", href: "#understand" },
  { label: "LAND", href: "#identify" },
  { label: "SITE SELECTION", href: "#recommend" },
  { label: "COPILOT", href: "#explain" },
] as const;

/** The route into the existing UrbanLens application. */
export const APP_ROUTE = "/app";
