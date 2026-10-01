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

## Current milestone

**Step 1.1** — app scaffold, design tokens (spec §§47–51), shell navigation with stub routes, `/admin` auth gate stub, folder layout for workers/data/docs.

## License

TBD (MIT or Apache 2.0).
