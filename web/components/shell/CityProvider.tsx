"use client";

import * as React from "react";
import { setApiCity } from "@/lib/client";
import { readCity, readCityServer, subscribeCity, writeCity } from "@/lib/city-store";

export interface CityOption {
  id: string;
  name: string;
  state: string;
  center: [number, number];
  zoom: number;
}

interface CityCtx {
  city: CityOption;
  cities: CityOption[];
  setCity: (id: string) => void;
  /** Bumped on every city change so views can reset and refetch. */
  epoch: number;
}

const Ctx = React.createContext<CityCtx | null>(null);

export function CityProvider({
  cities,
  children,
}: {
  cities: CityOption[];
  children: React.ReactNode;
}) {
  const stored = React.useSyncExternalStore(subscribeCity, readCity, readCityServer);

  // The stored value is authoritative only if it names a city we actually have.
  const cityId = stored && cities.some((c) => c.id === stored) ? stored : cities[0].id;

  // Keep the API client's city in step with the resolved selection. This runs
  // during render on purpose: an API call fired by a child's mount effect would
  // otherwise go out against the previous city.
  setApiCity(cityId);

  // Children key off this so a city change fully remounts them (see CityScope).
  const epoch = React.useMemo(() => cities.findIndex((c) => c.id === cityId), [cities, cityId]);

  const setCity = React.useCallback(
    (id: string) => {
      if (id === cityId || !cities.some((c) => c.id === id)) return;
      writeCity(id);
    },
    [cityId, cities]
  );

  const value = React.useMemo<CityCtx>(
    () => ({
      city: cities.find((c) => c.id === cityId) ?? cities[0],
      cities,
      setCity,
      epoch,
    }),
    [cityId, cities, setCity, epoch]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCity(): CityCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useCity must be used inside <CityProvider>");
  return ctx;
}

/**
 * Remounts its children whenever the city changes. Every page holds fetched
 * city data in local state and loads it in mount effects, so a remount is both
 * the simplest and the most reliable way to guarantee nothing from the previous
 * city survives — stale parcel ids, map feature state, selections and all.
 */
export function CityScope({ children }: { children: React.ReactNode }) {
  const { epoch } = useCity();
  return <React.Fragment key={epoch}>{children}</React.Fragment>;
}
