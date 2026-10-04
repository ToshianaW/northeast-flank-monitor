import { handleOpenData, optionsResponse } from "@/lib/open-data-handler";
import { loadOpenDataPage } from "@/lib/public-open-data";

/** GET /api/events.csv: published events as CSV, at most 2,000 rows (docs/data.md). */
export function GET(request: Request): Promise<Response> {
  return handleOpenData(request, "csv", loadOpenDataPage);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
