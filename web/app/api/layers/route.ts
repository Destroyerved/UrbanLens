import { NextRequest } from "next/server";
import { getDataset, getCityConfig } from "@/lib/data/store";
import { zoningConflicts } from "@/lib/gis/engine";
import { getPopulationGrid } from "@/lib/gis/population";
import { cityIdFrom, json } from "@/lib/api";
import type { CityDataset, DataLayerKey } from "@/lib/types";

/**
 * Catalogue of the spatial layers available for a city (PRD §56 `/api/layers`):
 * what each layer is, where to fetch it, how many features it holds and — the
 * part that matters for a planning tool — where its data actually came from.
 */
interface LayerEntry {
  key: string;
  label: string;
  endpoint: string;
  geometry: "polygon" | "line" | "point";
  features: number;
  /** Which provenance record in `dataset.sources` governs this layer. */
  provenance: DataLayerKey;
}

export async function GET(req: NextRequest) {
  const cityId = cityIdFrom(req);
  const ds = getDataset(cityId);
  const config = getCityConfig(cityId);
  const grid = getPopulationGrid(ds);

  const layers: LayerEntry[] = [
    {
      key: "boundary",
      label: "City boundary",
      endpoint: "/api/boundary",
      geometry: "polygon",
      features: 1,
      provenance: "wards",
    },
    {
      key: "wards",
      label: "Ward boundaries",
      endpoint: "/api/wards",
      geometry: "polygon",
      features: ds.wards.features.length,
      provenance: "wards",
    },
    {
      key: "population",
      label: "Population density",
      endpoint: "/api/population",
      geometry: "point",
      features: grid.cellCount,
      provenance: "population",
    },
    {
      key: "parcels",
      label: "GLIS parcels",
      endpoint: "/api/parcels",
      geometry: "polygon",
      features: ds.parcels.features.length,
      provenance: "parcels",
    },
    {
      key: "conflicts",
      label: "Zoning conflicts",
      endpoint: "/api/zoning/conflicts",
      geometry: "point",
      features: zoningConflicts(ds).length,
      provenance: "parcels",
    },
    {
      key: "roads",
      label: "Roads & rivers",
      endpoint: "/api/roads",
      geometry: "line",
      features: ds.roads.features.length,
      provenance: "roads",
    },
    {
      key: "facilities",
      label: "Public facilities",
      endpoint: "/api/facilities",
      geometry: "point",
      features: ds.facilities.features.length,
      provenance: "facilities",
    },
    {
      key: "prediction",
      label: "2030 growth probability",
      endpoint: "/api/growth/prediction",
      geometry: "polygon",
      features: ds.prediction.features.length,
      provenance: "prediction",
    },
  ];

  return json({
    city: { id: config.id, name: config.name, state: config.state, center: config.center, zoom: config.zoom },
    sources: ds.sources as CityDataset["sources"],
    layers: layers.map((l) => ({ ...l, source: ds.sources[l.provenance] })),
  });
}
