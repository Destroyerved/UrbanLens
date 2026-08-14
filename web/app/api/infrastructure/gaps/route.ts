import { NextRequest } from "next/server";
import { getDataset } from "@/lib/data/store";
import { coverageReport, infrastructureGaps } from "@/lib/gis/engine";
import { cityIdFrom, json } from "@/lib/api";

export async function GET(req: NextRequest) {
  const ds = getDataset(cityIdFrom(req));
  // `coverage` states how completely each service's facilities are mapped, so a
  // low score can be read as "genuinely underserved" or "thinly mapped".
  return json({ wards: infrastructureGaps(ds), coverage: coverageReport(ds) });
}
