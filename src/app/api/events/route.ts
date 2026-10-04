import { handleOpenData, optionsResponse } from "@/lib/open-data-handler";
import { loadOpenDataPage } from "@/lib/public-open-data";

/** GET /api/events: published events as JSON (docs/data.md). Read-only; GET and OPTIONS only. */
export function GET(request: Request): Promise<Response> {
  return handleOpenData(request, "json", loadOpenDataPage);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
