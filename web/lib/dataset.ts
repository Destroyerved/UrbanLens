import type { Facility, GridCell, LandUse, LngLat, Parcel, Road, Ward, Year } from "@/types";
import type { FeatureCollection } from "geojson";
import { apiGet, ApiError } from "@/lib/api";
import { m2 } from "@/lib/marks";

/**
 * The active study area's map layers.
 *
 * These used to be baked into the bundle at build time by a sync script, because
 * the old TypeScript analysis engine read them synchronously. That engine is
 * gone — the layers are now only ever rendered, never analysed here — so they
 * are fetched from the Python engine instead. That is what makes the study-area
 * switcher possible at all: four areas baked would be ~14 MB of JavaScript,
 * where four areas fetched cost nothing until they are asked for.
 *
 * The mapping from the engine's vocabulary to the UI's lives here and only here.
 */

/** The engine's land-use vocabulary → this app's. */
const LAND_USE: Record<string, LandUse> = {
  residential: "residential",
  commercial: "commercial",
  industrial: "industrial",
  institutional: "public",
  agriculture: "agriculture",
  vacant: "vacant",
  mixed: "mixed",
  green: "vegetation",
  water: "water",
};

/** The engine's official zoning vocabulary → this app's land-use enum. */
const ZONING: Record<string, LandUse> = {
  residential: "residential",
  commercial: "commercial",
  industrial: "industrial",
  agricultural: "agriculture",
  public_semi_public: "public",
  recreational: "vegetation",
  mixed_use: "mixed",
};

const FACILITY: Record<string, string> = {
  hospital: "hospital",
  clinic: "clinic",
  school: "school",
  college: "school",
  park: "park",
  bus_stop: "transit",
  metro_station: "transit",
  fire_station: "fire",
  police_station: "police",
  government_office: "govt",
};

export interface CityDataset {
  cityId: string;
  parcels: Parcel[];
  wards: Ward[];
  roads: Road[];
  facilities: Facility[];
  grid: GridCell[];
  vegetation: FeatureCollection;
  greenspace: FeatureCollection;
}

const round = (n: number, d = 2) => Number(Number(n).toFixed(d));

/** Exterior ring; for a MultiPolygon, the largest part. */
function outerRing(geometry: Geom): LngLat[] {
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][])[0] as LngLat[];
  let best: number[][] | null = null;
  let bestLen = -1;
  for (const poly of geometry.coordinates as number[][][][]) {
    if (poly[0].length > bestLen) {
      bestLen = poly[0].length;
      best = poly[0];
    }
  }
  return (best ?? []) as LngLat[];
}

const snap = (ring: LngLat[]): LngLat[] =>
  ring.map(([lng, lat]) => [round(lng, 6), round(lat, 6)] as LngLat);

/**
 * Built-up share is the only per-year signal the engine records, so land use per
 * year is reconstructed from it: a parcel below the built-up threshold in an
 * earlier year is treated as having been undeveloped then. Present-day land use
 * is real; the earlier years are inferred, which is what the Time Machine needs
 * and no more than the engine itself claims.
 */
function landUseByYear(
  props: { h2018: number; h2022: number; h2024: number },
  current: LandUse,
): Record<Year, LandUse> {
  const undeveloped: LandUse =
    current === "water" || current === "vegetation" ? current : "vacant";
  const at = (built: number) => (built >= 25 ? current : undeveloped);
  return {
    2018: at(props.h2018),
    2022: at(props.h2022),
    2024: at(props.h2024),
    2026: current,
  };
}

/** Cell edge in degrees at the sampling step the population route is asked for. */
const POP_STEP = 2;
const CELL_DEG = 0.00225 * POP_STEP;

const d2 = (ax: number, ay: number, bx: number, by: number) =>
  (ax - bx) ** 2 + (ay - by) ** 2;

function nearestKm(lng: number, lat: number, pts: LngLat[]): number {
  let bd = Infinity;
  for (const [px, py] of pts) {
    const dd = d2(lng, lat, px, py);
    if (dd < bd) bd = dd;
  }
  if (bd === Infinity) return 0;
  // Degrees → km at this latitude; adequate for a nearest-distance field.
  return Math.sqrt(bd) * 111.32 * 0.92;
}

/** Minimal shapes for the engine's GeoJSON — only the fields read below. */
interface Geom {
  type: string;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}
interface Feat<P> {
  geometry: Geom;
  properties: P;
}
interface FC<P> {
  features: Feat<P>[];
}

interface WardProps {
  ward_code: string;
  name: string;
  centroid: LngLat;
  area_sqm: number;
  population: number;
}
interface ParcelProps {
  parcel_id: string;
  survey_number?: string;
  ward: string;
  centroid: LngLat;
  area_sqm: number;
  ownership: string;
  zoning: string;
  land_use: string;
  built_up_percent: number;
  vegetation_percent?: number;
  road_km?: number;
  hospital_km?: number;
  school_km?: number;
  park_km?: number;
  transit_km?: number;
  population_3km?: number;
  flood_risk: string;
  infrastructure_readiness?: number;
  environmental_sensitivity?: number;
  development_potential?: number;
  zoning_conflict?: boolean;
  h2018: number;
  h2022: number;
  h2024: number;
}
interface FacilityProps {
  id: string;
  name: string;
  facility_type: string;
}
interface RoadProps {
  id: string;
  name: string;
  road_type: string;
}

interface FastBootstrap {
  v: number;
  c: string;
  cell: number;
  /** [id,name,ring,centroid,areaKm2,population] */
  w: [string, string, LngLat[], LngLat, number, number][];
  /** Compact parcel transport tuple; decoded below. */
  p: any[][];
  /** [id,name,engineFacilityType,lng,lat] */
  f: [string, string, string, number, number][];
  /** [id,name,path] */
  r: [string, string, LngLat[]][];
  /** [lng,lat,population,growthProbability,hospitalKm,b18,b22,b24] */
  g: [number, number, number, number, number, number, number, number][];
  /** Precomputed overview/infrastructure/growth summaries. */
  a?: FastAnalytics;
}

export interface FastAnalytics {
  o: Record<string, any>;
  i: { wards: any[]; coverage: any[] };
  gr: Record<string, any>;
}

const fastAnalyticsCache = new Map<string, FastAnalytics>();
export const getFastAnalytics = (cityId: string) => fastAnalyticsCache.get(cityId) ?? null;

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

async function fetchStaticGzipJson<T>(path: string): Promise<T | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok || !res.body) return null;
    if ((res.headers.get("content-encoding") ?? "").toLowerCase().includes("gzip")) {
      return (await res.json()) as T;
    }
    if (!("DecompressionStream" in window)) return null;
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    return (await new Response(stream).json()) as T;
  } catch {
    return null;
  }
}

/** Try the prebuilt Vercel/static-CDN payload before waking the Python host. */
async function fetchStaticBootstrap(cityId: string): Promise<FastBootstrap | null> {
  return fetchStaticGzipJson<FastBootstrap>(
    `/data/bootstrap/${encodeURIComponent(cityId)}.json.gz`,
  );
}

/**
 * One request replaces the old eight-request city waterfall. The backend
 * already returns UI-oriented compact tuples and has combined population,
 * growth and healthcare reach, so there is no O(grid × prediction) loop here.
 */
async function loadCityDataset(cityId: string): Promise<CityDataset> {
  m2("ds:start");
  const b =
    (await fetchStaticBootstrap(cityId)) ??
    (await apiGet<FastBootstrap>("/api/bootstrap", { city: cityId }));
  m2("ds:fetched");
  if (b.v < 5) throw new Error(`Unsupported UrbanLens bootstrap v${b.v}`);
  if (b.a) fastAnalyticsCache.set(cityId, b.a);

  const wards: Ward[] = b.w.map(([id, name, ring, centroid, areaKm2, pop]) => ({
    id,
    name,
    ring,
    centroid,
    areaKm2,
    population: {
      2018: Math.round(pop / 1.18),
      2022: Math.round(pop / 1.08),
      2024: Math.round(pop / 1.04),
      2026: pop,
    },
  }));

  const parcels: Parcel[] = b.p.map((r) => {
    const landUse = LAND_USE[r[8]] ?? "vacant";
    return {
      id: r[0],
      surveyNumber: r[1] ?? "—",
      wardId: r[2],
      centroid: r[3] as LngLat,
      ring: r[4] as LngLat[],
      areaHa: r[5],
      ownership: r[6],
      zoning: ZONING[r[7]] ?? "mixed",
      landUse,
      landUseByYear: landUseByYear(
        { h2018: r[9], h2022: r[10], h2024: r[11] },
        landUse,
      ),
      builtUpPct: r[12],
      vegetationPct: r[13],
      roadDistKm: r[14],
      hospitalDistKm: r[15],
      schoolDistKm: r[16],
      parkDistKm: r[17],
      transitDistKm: r[18],
      population3km: r[19],
      floodRisk: r[20],
      infraReadiness: r[21],
      envSensitivity: r[22],
      developmentPotential: r[23],
      zoningConflict: Boolean(r[24]),
    } as Parcel;
  });

  const facilities: Facility[] = b.f
    .map(([id, name, rawType, lng, lat]) => {
      const type = FACILITY[rawType];
      if (!type) return null;
      return { id, name, type, coord: [lng, lat] as LngLat };
    })
    .filter(Boolean) as Facility[];

  const roads: Road[] = b.r.map(([id, name, path]) => ({ id, name, path })) as Road[];

  const half = b.cell / 2;
  const grid: GridCell[] = b.g.map(
    ([lng, lat, population, growthProb, hospitalDistKm, b18, b22, b24], i) => ({
      id: `cell-${i}`,
      center: [lng, lat] as LngLat,
      ring: [
        [lng - half, lat - half],
        [lng + half, lat - half],
        [lng + half, lat + half],
        [lng - half, lat + half],
        [lng - half, lat - half],
      ] as LngLat[],
      population,
      wardId: "",
      growthProb,
      hospitalDistKm,
      inCity: true,
      built:
        b18 !== undefined ? { 2018: b18, 2022: b22, 2024: b24 } : undefined,
    }),
  );

  m2("ds:decoded");
  return {
    cityId: b.c,
    parcels,
    wards,
    roads,
    facilities,
    grid,
    vegetation: EMPTY_FC,
    greenspace: EMPTY_FC,
  };
}

const optionalLayerCache = new Map<
  string,
  Promise<{ vegetation: FeatureCollection; greenspace: FeatureCollection }>
>();

/** Non-critical satellite/green polygons load after the map is interactive. */
export function fetchOptionalCityLayers(cityId: string) {
  const cached = optionalLayerCache.get(cityId);
  if (cached) return cached;
  const pending = (async () => {
    const staticLayers = await fetchStaticGzipJson<{ v: FeatureCollection; g: FeatureCollection }>(
      `/data/optional/${encodeURIComponent(cityId)}.json.gz`,
    );
    if (staticLayers) {
      return { vegetation: staticLayers.v ?? EMPTY_FC, greenspace: staticLayers.g ?? EMPTY_FC };
    }
    const [vegetation, greenspace] = await Promise.all([
      fetchOptional<FC<unknown>>("/api/vegetation", { city: cityId }),
      fetchOptional<FC<unknown>>("/api/greenspace", { city: cityId }),
    ]);
    return {
      vegetation: (vegetation as FeatureCollection | null) ?? EMPTY_FC,
      greenspace: (greenspace as FeatureCollection | null) ?? EMPTY_FC,
    };
  })().catch((err) => {
    optionalLayerCache.delete(cityId);
    throw err;
  });
  optionalLayerCache.set(cityId, pending);
  return pending;
}

const cityDatasetCache = new Map<string, Promise<CityDataset>>();

/** Cache complete city datasets in the browser so A → B → A does not redownload
 * several megabytes of stable GIS layers. Concurrent callers also share one promise. */
export function fetchCityDataset(cityId: string): Promise<CityDataset> {
  const cached = cityDatasetCache.get(cityId);
  if (cached) return cached;
  const pending = loadCityDataset(cityId).catch((err) => {
    cityDatasetCache.delete(cityId);
    throw err;
  });
  cityDatasetCache.set(cityId, pending);
  return pending;
}

/** Target cities' bootstraps are prefetched on hover in the switcher so the
 * switch's own fetch no longer sits on the critical path. The cache here makes
 * repeat hovers no-ops. */
const prefetched = new Set<string>();
export function prefetchBootstrap(cityId: string): void {
  if (prefetched.has(cityId) || typeof window === "undefined") return;
  prefetched.add(cityId);
  try {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "fetch";
    link.href = `/data/bootstrap/${encodeURIComponent(cityId)}.json.gz`;
    document.head.appendChild(link);
  } catch {
    prefetched.delete(cityId);
  }
}

/**
 * Like apiGet but tolerates 404 — composite study areas (`gujarat`) have no
 * vegetation/greenspace engine file, so those fetches
 * legitimately 404 and the caller should get `null` rather than an error that
 * blanks the whole dashboard.
 */
async function fetchOptional<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T | null> {
  try {
    return await apiGet<T>(path, params);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
