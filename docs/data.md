# Open data API

Read-only access to published events (spec §58, roadmap Phase 7). Public page: `/data`. Code: `src/lib/open-data.ts` (checks, output, CSV), `src/lib/public-open-data.ts` (queries), `src/lib/open-data-handler.ts`, `src/app/api/events/route.ts`, `src/app/api/events.csv/route.ts`. Tests: `src/lib/open-data.test.mts`, `src/lib/open-data.db.test.mts`, and the isolation test.

## Licence

Summaries and metadata: CC BY 4.0, Northeast Flank Monitor. Excerpts and linked articles remain the property of their original sources. Some reporting is found through the GDELT Project (https://www.gdeltproject.org/).

## Endpoints

- `GET /api/events`: JSON `{ data, meta: { count, limit, next_cursor, filters, generated_at }, attribution }`.
- `GET /api/events.csv`: the same events as CSV (RFC 4180; cells starting with `= + - @`, tab or CR are prefixed with `'`). Licence in the `X-Data-Licence` header and in a final `licence` column on every row ("CC BY 4.0, Northeast Flank Monitor. Excerpts and linked articles remain the property of their original sources."). When more rows exist: `X-Truncated: true` and `X-Next-Cursor`.
- `OPTIONS` on both: CORS preflight. `Access-Control-Allow-Origin: *`, GET only, no credentials.

## Parameters

Only these are accepted; any other parameter, a repeated parameter or an invalid value returns **400 before any database query**.

| Parameter | Values |
| --- | --- |
| `area` | PL, LT, LV, EE, BY, RU-KGD, RU-W, BALTIC-SEA, GULF-OF-FINLAND, RU-ELSE, UA, WEST-EU, NORTH-AM, THEATER-WIDE, UNPLACED, or a name (kaliningrad, lithuania, …). Assigned by the map's own placement. |
| `type` | Event types, comma-separated |
| `from`, `to` | YYYY-MM-DD; default the last 30 days; at most 90 days |
| `layer` | all (default), activity, statements |
| `limit` | JSON 1–200 (default 50); CSV 1–2,000 (default 2,000) |
| `cursor` | `next_cursor` from the previous response (keyset on event date and id, newest first) |

## Fields

Event: `event_id, url, event_date, reported_date, headline, summary, actor, country, region, location_name, location_precision, area, layer, event_type, event_subtype, exercise_name, exercise_status, unit_name, unit_type, unit_home_location, personnel_estimate, equipment_type, equipment_quantity, activity_description, source_name, source_url, source_type, confidence_level, first_reported, last_updated, announced_start_date, announced_end_date, observed_start_date, observed_end_date, personnel_return_status, equipment_return_status, infrastructure_status, follow_on_activity, overall_reset_status, contradiction_flag, contradiction_notes, sources`.

Source: `name, home_url, source_type, source_country, tier, state_or_official, article_url, relationship, is_primary, excerpt`. `state_or_official` is the same label the site shows.

The output is built from an allowlist (`OUTPUT_EVENT_FIELDS`, `OUTPUT_SOURCE_FIELDS`). Never included: internal notes, reviewer names, coordinates, AI working fields, review fields, raw documents or stored article text. A field-leak test fails if anything else appears.

## Selection

- PUBLISHED events only.
- Decision 11, as on the map: an event dated (or first reported) in the last 72 hours whose SUPPORTS sources are all Tier 4 is held back.
- The historical record is not part of this API (the static isolation test keeps the API from reading historical tables).

## Cost safety (Vercel Hobby)

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` on 200 and 400 responses, so repeated requests are served by Vercel's CDN without running the function or querying the database. Errors are `no-store`.
- Parameter allowlist checked before any query, so random query strings cannot multiply database work.
- Caps: 90-day range, 200 JSON events, 2,000 CSV rows. No rate-limit tables or other infrastructure. If abuse appears, Hobby includes one WAF rate-limiting rule per project (see `docs/running-costs.md`).
