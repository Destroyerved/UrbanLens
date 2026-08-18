import { apiPostPdf } from "./api";

/**
 * Download a parcel recommendation report as a PDF (VD-9 / FE-B3).
 * The engine picks the parcel's #1 recommended use when no project is given.
 */
export async function downloadRecommendationPdf(
  parcelId: string,
  project?: string,
): Promise<void> {
  const blob = await apiPostPdf("/api/report", {
    parcel_id: parcelId,
    project_type: project ?? null,
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `urbanlens-recommendation-${parcelId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}