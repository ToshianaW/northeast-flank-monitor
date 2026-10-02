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

**Next: Phase 2 — Initial automation** (step 2.1: wire 5–10 sources into `workers/collector`).

## License

TBD (MIT or Apache 2.0).
