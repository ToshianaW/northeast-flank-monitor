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

**Next:** step 2.2, Claude extraction of candidate events from `raw_documents` into the review queue.

## License

TBD (MIT or Apache 2.0).
