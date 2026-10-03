# Northeast Flank Monitor

Open-source OSINT monitoring of military activity across NATO’s northeastern flank (Kaliningrad, western Belarus, Suwałki corridor, Baltics, northeastern Poland, and relevant western Russia).

**Core question:** Is the regional military baseline changing?

Observe behavior. Track the baseline. Compare historically. Do not predict intent.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Single app: public site + protected `/admin` route group
- Top-level `workers/`, `data/`, `docs/` (Python workers and datasets arrive in later steps)
- PostgreSQL + PostGIS, MapLibre, Claude pipeline — see `docs/spec.md` and the project MVP plan

## Run locally

```bash
npm install
cp .env.example .env.local   # then set ADMIN_PASSWORD
npm run dev
```

`ADMIN_PASSWORD` is required, with no default. `npm run dev` and `npm start` exit with an error if it is unset or still the `.env.example` placeholder. `npm run build` does not need it.

Secrets: all `.env*` files are gitignored except `.env.example`, which holds placeholders only. This repository is public, so anything committed stays in git history even if deleted later — never commit real credentials.

Dev server defaults to [http://127.0.0.1:43127](http://127.0.0.1:43127).

Admin: [http://127.0.0.1:43127/admin](http://127.0.0.1:43127/admin) (password from `ADMIN_PASSWORD`).

## Database

PostgreSQL with PostGIS (Neon). Migrations are plain SQL in `src/db/migrations/`, applied in filename order with `psql` using the **direct** (non-pooled) `DATABASE_URL`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0001_initial_schema.sql
```

Each migration runs in a single transaction, so a failure leaves the database unchanged.

## Collector

Fetches the last 48 hours from configured feeds, the Polish MoD news listing, and the GDELT DOC API into the private `raw_documents` table (migration 0003). Nothing in `raw_documents` is shown on the site.

```bash
npm run collect
```

- Configuration: `data/sources/collector.json` (feeds, listing, GDELT queries, keyword filter, rate limits).
- Needs `DATABASE_URL` (the direct connection) in `.env.local` or the environment.
- Honors robots.txt, identifies itself as `NortheastFlankMonitor-collector/0.1`, and waits between requests to the same host (GDELT: at least 6 s after each response).
- Prints one summary line per source; exits with code 1 if any source failed.
- GDELT data is used under its terms, which require citing the GDELT Project with a link to https://www.gdeltproject.org/.

## Daily digest

Drafts the digest for one UTC day (default: yesterday) from PUBLISHED events only, and stores it as a DRAFT for review in `/admin/digests`. The model sees each event's headline, summary, date, type, actor, country, location, confidence, contradiction flag, and source names with tier and relationship; never excerpts, internal notes, URLs, or article text.

```bash
npm run digest -- --date 2026-10-01 --dry-run   # prints each sentence with the events it cites; writes nothing
npm run digest -- --date 2026-10-01             # writes a DRAFT if no digest exists for that date
```

- `--replace-draft` replaces an unedited AI draft; add `--force` (local only) for an edited or manual draft. A published digest is never replaced.
- `--max-usd` (default 0.25) is checked against the worst case before the call.
- Needs `DATABASE_URL_POOLED` and `ANTHROPIC_API_KEY`.

## Progress

Roadmap: `docs/mvp-plan.md` §4. Decisions that override the plan: `docs/decisions.md`.

**Phase 1 — Foundation: complete**

| Step | What exists |
| --- | --- |
| 1.1 | App scaffold, design tokens (spec §§47–51), navigation, `/admin` auth gate, `workers/` `data/` `docs/` layout |
| 1.2 | Initial schema migration: enums, sources, events, event sources, exercises, review log, daily digests; PostGIS enabled |
| 1.3 | Source registry: admin list/create/edit/delete; public `/sources` grouped by tier with state-source labels |
| 1.4 | Admin manual event create/edit with all spec §24 fields and attached sources |
| 1.5 | Review queue: approve, reject, merge, edit; append-only review log; only published events are public |
| 1.6 | Public `/latest` feed and stable `/events/[id]` pages |
| 1.7 | Homepage: last update, Regional Activity placeholder (no score), 24-hour snapshot, latest events |
| 1.8 | Manually written daily digest: admin editor, public `/digest` and `/digest/[date]`, homepage panel |
| 1.9 | Public `/archive` with date, country, actor, type, confidence, and source-type filters |
| 1.10 | Public `/methodology` and `/about` pages |

**Phase 2 — Initial automation: complete** (steps 2.4 and 2.5 are covered by human review; decisions #12 and #13)

| Step | What exists |
| --- | --- |
| 2.1 | Source collector (`npm run collect`): 9 feeds, the Polish MoD news listing, and GDELT into the private `raw_documents` table (migration 0003); robots.txt, rate limits, URL and content dedup, keyword filter for broad feeds, `no_ai_processing` and `lead_only` flags |
| 2.2 | Claude extraction (`npm run extract`): eligible `raw_documents` rows to validated DRAFT events (UNVERIFIED, one SUPPORTS source) for human review; predictive-language and excerpt checks; spend cap; `extraction_runs` log (migration 0004) |
| 2.3 | Duplicate suggestions (`npm run dedup`): same type and country within 2 days, URL match or headline trigram similarity, one Haiku call for borderline pairs; shown on the review page with a pre-selected merge target; never merged automatically (migration 0005) |
| 2.4 | Covered by human review (decision #12): `contradiction_flag`, notes, and CONTRADICTS sources are set by the reviewer; no automated contradiction detection |
| 2.5 | Covered by human review (decision #13): tier, type, and reliability come from the source registry (step 1.3); the reviewer chooses confidence at approval, with a rule-based suggestion from the attached sources (no AI call) |
| 2.6 | Twice-daily pipeline on GitHub Actions (`.github/workflows/daily.yml`): collect, extract, dedup at 06:00 and 18:00 UTC; manual dry runs; counts-only logs |
| 2.7 | Claude-drafted daily digest (`npm run digest`): PUBLISHED events for one UTC day into a DRAFT digest; every sentence cites its events (`[ref …]` markers, numbered links on the public page); code checks for unknown or missing references, banned phrases, section names, and placement of unverified events; `.github/workflows/digest.yml` at 05:00 UTC. The digest opens with a short Summary (at most 2 sentences, 45 words) that leaves out unverified and contradicted events; code adds a sentence pointing to them |

**Phase 3 — Monitoring features: in progress**

| Step | What exists |
| --- | --- |
| 3.1 | Regional map (`/map`, Map in the sidebar, thumbnail on the dashboard): MapLibre with no tile server, Natural Earth outlines (`scripts/build-theater-geo.mts` → `public/geo/theater.geojson`). One dot per area with published items at a fixed, hand-set anchor (`data/map-anchors.json`), sized and coloured by count step on an amber-to-orange scale; no per-event markers or positions (decision #14). Clicking an area zooms to it with one dot per admin-1 region; a side panel lists its items. Items are placed at display time by the place they concern (`data/gazetteer.json`, `src/lib/placement.ts`), with "Outside the theater" cards (Russia elsewhere, Ukraine, Western Europe incl. EU/NATO institutions, North America), a Theater-wide list, and "Location unclear". Layers All (default), Activity, Statements; 7/30/90-day windows in the URL; Tier 4-only items from the last 72 hours are left off. Counts table for keyboard and screen readers. CSP adds only `worker-src 'self'` |
| 3.2 | Exercise tracker: admin list/create/edit with all spec §17 fields, attached sources, and linking published events; reviewer name on every save, logged in the append-only `exercise_actions` table (migration 0007). Public `/exercises` grouped by status and `/exercises/[id]` with announced and observed dates; only published exercises are public, and a published exercise needs a source. Dashboard panel lists active, extended, and concluding exercises. Statuses never change on their own when a date passes |
| 3.3 | Post-exercise reset widget on the exercise page: personnel, equipment, temporary infrastructure, follow-on activity, and overall status. Unknown shows as "not enough open-source evidence" in a neutral tone. A reset status other than Unknown needs evidence (a source with an excerpt, or a linked published event dated on or after the exercise's end); FULL_RESET also needs all three dimensions returned or removed. Enforced in the form and by database triggers |

**Phase 4 — Historical dataset: in progress**

| Step | What exists |
| --- | --- |
| 4.0 | Separate historical tables (migration 0008: `historical_events`, `historical_event_sources`, `historical_review_actions`), so no current-facing query can return a historical row (isolation and static tests). Database rules: a published historical event needs a supporting Tier 1–3 source, excerpts are 20 words or fewer, a source's tier cannot be changed if that would leave a published historical event Tier 4-only. Admin `/admin/historical` (own queue; reviewer name on every save, approve, reject and unpublish; phase tag admin-only). Public `/historical` by month with a period filter and `/historical/[id]`, each with a coverage note. Historical-only sources are never collected, hidden from current pickers, and labelled on `/sources` |

**Planned, off the sidebar:** Side-by-side view (`/historical/compare`, roadmap Phase 5: synchronized timelines and the indicator matrix), listed in `PLANNED_PAGES` (`src/lib/nav.ts`). The live page is Historical Comparison (`/historical`).

**Next:** step 3.4 (Air Activity page); Phase 4 import and candidate suggester.

## License

TBD (MIT or Apache 2.0).
