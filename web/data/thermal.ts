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
}

const EMPTY: ThermalStatus = { ok: false, date: null, updated_at: null, bounds: null };

let status: ThermalStatus = EMPTY;
let lastFetchedAt = 0;
const listeners = new Set<() => void>();

const POLL_MS = 60_000;

function emit() {
  for (const l of listeners) l();
}

function setStatus(next: ThermalStatus) {
  status = next;
  lastFetchedAt = Date.now();
  emit();
}

async function fetchStatus() {
  try {
    const s = await apiGet<ThermalStatus>("/api/thermal/status");
    setStatus({
      ok: !!s.ok,
      date: s.date ?? null,
      updated_at: s.updated_at ?? null,
      bounds: s.bounds ?? null,
      reason: s.reason,
    });
  } catch {
    // Backend unreachable — keep whatever we last had (possibly EMPTY).
  }
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