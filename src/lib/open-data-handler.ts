import {
  CACHE_CONTROL,
  CORS_HEADERS,
  csvBody,
  jsonBody,
  LICENCE_LINE,
  parseQuery,
  type Query,
} from "@/lib/open-data";

/**
 * GET handler shared by /api/events and /api/events.csv. Parameters are checked before the loader
 * is called, so a bad request returns 400 without any database query. Successful and 400
 * responses are cacheable by the CDN; errors are not.
 */

export type Loader = (query: Query, now: Date) => Promise<{ events: import("@/lib/open-data").OutputEvent[]; nextCursor: string | null }>;

const jsonHeaders = (extra: Record<string, string> = {}) => ({
  "Content-Type": "application/json; charset=utf-8",
  ...CORS_HEADERS,
  ...extra,
});

export async function handleOpenData(
  request: Request,
  format: "json" | "csv",
  load: Loader,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseQuery(url.searchParams, { format, today: now.toISOString().slice(0, 10) });
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: jsonHeaders({ "Cache-Control": CACHE_CONTROL }),
    });
  }

  let page: Awaited<ReturnType<Loader>>;
  try {
    page = await load(parsed.query, now);
  } catch {
    return new Response(JSON.stringify({ error: "The data could not be loaded. Try again later." }), {
      status: 503,
      headers: jsonHeaders({ "Cache-Control": "no-store" }),
    });
  }

  if (format === "json") {
    return new Response(JSON.stringify(jsonBody(page.events, parsed.query, page.nextCursor, now.toISOString())), {
      status: 200,
      headers: jsonHeaders({ "Cache-Control": CACHE_CONTROL }),
    });
  }
  const headers: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="northeast-flank-monitor-events.csv"',
    "Cache-Control": CACHE_CONTROL,
    "X-Data-Licence": LICENCE_LINE,
    ...CORS_HEADERS,
    "Access-Control-Expose-Headers": "X-Truncated, X-Next-Cursor, X-Data-Licence",
  };
  if (page.nextCursor) {
    headers["X-Truncated"] = "true";
    headers["X-Next-Cursor"] = page.nextCursor;
  }
  return new Response(csvBody(page.events), { status: 200, headers });
}

/** CORS preflight: GET only, no credentials. */
export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
}
