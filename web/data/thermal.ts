import { useSyncExternalStore } from "react";
import { apiGet } from "@/lib/api";

/**
 * Shared LST (Urban Heat Island) status — fetched from the backend once per
 * session and on a slow poll. Both MapCanvas (raster visibility + cache-bust)
 * and Legend (date / stale tag) read the same value so they stay in sync.
 */

export interface ThermalStatus {
  ok: boolean;
  date: string | null;
  updated_at: string | null;
  bounds: [number, number, number, number] | null;
  reason?: string;
  /** District the status was scoped to, when one was requested. */
  city?: string | null;
  /** "district" = crop over this district's wards; "state" = master scene. */
  scope?: "district" | "state";
  /** Why a requested district view degraded to the statewide scene. */
  note?: string | null;
  /** Fraction (0-1) of the district's extent with an actual satellite reading. */
  coverage?: number | null;
  /** The date whose crop is shown, when it is not today's pass (cloud fallback). */
  master_date?: string | null;
}

const EMPTY: ThermalStatus = {
  ok: false,
  date: null,
  updated_at: null,
  bounds: null,
  scope: "state",
};

let status: ThermalStatus = EMPTY;
let lastFetchedAt = 0;
let activeCity: string | null = null;
const listeners = new Set<() => void>();

// The LST scene changes at most once per satellite pass, so the poll only
// exists to pick up a backend refresh — ten minutes is already generous.
const POLL_MS = 10 * 60 * 1000;

function emit() {
  for (const l of listeners) l();
}

/** Fields that consumers actually render. Compared to decide whether the
 *  store changed at all. */
function same(a: ThermalStatus, b: ThermalStatus) {
  return (
    a.ok === b.ok &&
    a.date === b.date &&
    a.updated_at === b.updated_at &&
    a.scope === b.scope &&
    a.city === b.city &&
    a.note === b.note &&
    a.coverage === b.coverage &&
    a.master_date === b.master_date &&
    a.reason === b.reason &&
    String(a.bounds) === String(b.bounds)
  );
}

function setStatus(next: ThermalStatus) {
  // Always record the fetch, even when nothing moved, so the poll backs off.
  lastFetchedAt = Date.now();

  // Emitting an equal-but-new object is not free here. useSyncExternalStore
  // compares snapshots by reference, so a fresh object literal re-renders
  // every consumer -- and MapCanvas has an effect that depends on `thermal`
  // AND calls refreshThermalStatus(), which turns that re-render into another
  // fetch, and that fetch into another re-render. The satellite scene changes
  // once per pass; the store must not claim otherwise.
  if (same(status, next)) return;

  status = next;
  emit();
}

// A silently abandoned fetch would leave the PREVIOUS district's scene in
// place indefinitely, so transient failures (engine restart mid-crop
// generation, network blip) are retried a few times with backoff.
const STATUS_RETRIES = 3;
const STATUS_RETRY_MS = 1500;

async function fetchStatus(attempt = 0) {
  // Capture the request's city so a district switch mid-flight cannot let a
  // stale response overwrite the newer scope.
  const forCity = activeCity;
  try {
    const q = forCity ? `?city=${encodeURIComponent(forCity)}` : "";
    const s = await apiGet<ThermalStatus>(`/api/thermal/status${q}`);
    if (forCity !== activeCity) return;
    setStatus({
      ok: !!s.ok,
      date: s.date ?? null,
      updated_at: s.updated_at ?? null,
      bounds: s.bounds ?? null,
      reason: s.reason,
      city: s.city ?? forCity,
      scope: s.scope === "district" ? "district" : "state",
      note: s.note ?? null,
      coverage: typeof s.coverage === "number" ? s.coverage : null,
      master_date: s.master_date ?? null,
    });
  } catch {
    if (forCity === activeCity && attempt < STATUS_RETRIES - 1) {
      setTimeout(() => {
        if (forCity === activeCity) void fetchStatus(attempt + 1);
      }, STATUS_RETRY_MS * (attempt + 1));
    }
    // After the final attempt: keep whatever we last had. The slow poll and
    // the next explicit refresh (toggle / selection) will try again anyway.
  }
}

/** Point the LST layer at a district (or null for the statewide scene).
 *  Refetches whenever the district actually changes. */
export function setThermalCity(city: string | null) {
  if (city === activeCity) return;
  activeCity = city;
  void fetchStatus();
}

export function getThermalCity(): string | null {
  return activeCity;
}

/** Kick off the initial fetch once (idempotent per session). */
export function initThermalStatus() {
  if (lastFetchedAt === 0) void fetchStatus();
}

/** Re-fetch now (used when the layer is toggled on / window regains focus). */
export function refreshThermalStatus() {
  void fetchStatus();
}

export const THERMAL_STATUS = (): ThermalStatus => status;

export function useThermalStatus(): ThermalStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status
  );
}

if (typeof window !== "undefined") {
  setInterval(() => {
    if (Date.now() - lastFetchedAt >= POLL_MS) void fetchStatus();
  }, POLL_MS);
}