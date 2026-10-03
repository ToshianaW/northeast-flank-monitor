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

**Phase 2 — Initial automation: in progress**

| Step | What exists |
| --- | --- |
| 2.1 | Source collector (`npm run collect`): 9 feeds, the Polish MoD news listing, and GDELT into the private `raw_documents` table (migration 0003); robots.txt, rate limits, URL and content dedup, keyword filter for broad feeds, `no_ai_processing` and `lead_only` flags |
| 2.2 | Claude extraction (`npm run extract`): eligible `raw_documents` rows to validated DRAFT events (UNVERIFIED, one SUPPORTS source) for human review; predictive-language and excerpt checks; spend cap; `extraction_runs` log (migration 0004) |
| 2.3 | Duplicate suggestions (`npm run dedup`): same type and country within 2 days, URL match or headline trigram similarity, one Haiku call for borderline pairs; shown on the review page with a pre-selected merge target; never merged automatically (migration 0005) |
| 2.4 | Not built: no automated contradiction detection. `contradiction_flag`, notes, and CONTRADICTS sources are set by the reviewer |
| 2.5 | Partly: tier, type, and reliability come from the source registry (step 1.3), and the reviewer chooses confidence explicitly at approval. No automated classification or confidence assessment |
| 2.6 | Twice-daily pipeline on GitHub Actions (`.github/workflows/daily.yml`): collect, extract, dedup at 06:00 and 18:00 UTC; manual dry runs; counts-only logs |
| 2.7 | Claude-drafted daily digest (`npm run digest`): PUBLISHED events for one UTC day into a DRAFT digest; every sentence cites its events (`[ref …]` markers, numbered links on the public page); code checks for unknown or missing references, banned phrases, section names, and placement of unverified events; `.github/workflows/digest.yml` at 05:00 UTC. The digest opens with a short Summary (at most 2 sentences, 45 words) that leaves out unverified and contradicted events; code adds a sentence pointing to them |

**Next:** steps 2.4 and 2.5 (automated contradiction detection, source classification and confidence assessment).

## License

TBD (MIT or Apache 2.0).
