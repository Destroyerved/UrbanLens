import { apiGetBlob, apiPostBlob } from "./api";
import type { ProjectType, SiteConstraints, SuitabilityWeights } from "@/types";

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/**
 * Download a parcel recommendation report as a PDF (VD-9 / FE-B3).
 * The engine picks the parcel's #1 recommended use when no project is given.
 */
export async function downloadRecommendationPdf(
  parcelId: string,
  project?: string,
): Promise<void> {
  const blob = await apiPostBlob("/api/report", {
    parcel_id: parcelId,
    project_type: project ?? null,
  });
  triggerDownload(blob, `urbanlens-recommendation-${parcelId}.pdf`);
}

/**
 * Download the city's complete parcel inventory as CSV or GeoJSON.
 */
export async function downloadParcelsExport(
  format: "csv" | "geojson" = "csv",
  city?: string,
): Promise<void> {
  const blob = await apiGetBlob("/api/export/parcels", { format, city });
  const ext = format === "geojson" ? "geojson" : "csv";
  triggerDownload(blob, `urbanlens-parcels-${city ?? "export"}.${ext}`);
}

/**
 * Download ward-level infrastructure gap analysis as CSV.
 */
export async function downloadInfrastructureExport(city?: string): Promise<void> {
  const blob = await apiGetBlob("/api/export/infrastructure", { city });
  triggerDownload(blob, `urbanlens-infrastructure-gaps-${city ?? "export"}.csv`);
}

/**
 * Download service equity and deprivation report as CSV.
 */
export async function downloadEquityExport(city?: string): Promise<void> {
  const blob = await apiGetBlob("/api/export/equity", { city });
  triggerDownload(blob, `urbanlens-equity-${city ?? "export"}.csv`);
}

/**
 * Download evaluated site selection candidate results as CSV.
 */
export async function downloadSiteSelectionExport(params: {
  projectType: ProjectType;
  constraints?: Partial<SiteConstraints>;
  weights?: Partial<SuitabilityWeights>;
  city?: string;
}): Promise<void> {
  const blob = await apiPostBlob("/api/export/sites", {
    project_type: params.projectType,
    minimum_area_hectares: params.constraints?.minAreaHa,
    government_land: params.constraints?.governmentOnly ?? false,
    low_flood_risk: params.constraints?.lowFloodOnly ?? false,
    max_road_distance_km: params.constraints?.maxRoadDistKm,
    weights: params.weights,
    limit: 50,
  });
  triggerDownload(blob, `urbanlens-site-selection-${params.projectType}.csv`);
}