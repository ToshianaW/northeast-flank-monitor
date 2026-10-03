# Northeast Flank Monitor — Implementation Plan

Planning only. Project scope = full `docs/spec.md`. Every feature stays in scope. Stack per §43: Next.js, TypeScript, Tailwind, shadcn/ui, PostgreSQL + PostGIS, MapLibre, Anthropic Claude, Python workers, Neon/Supabase + Vercel. Solo developer, cost-conscious hosting — without cutting features.

Core question: *Is the regional military baseline changing?* Observe behavior; do not predict intent.

---

## 1. Scope (full spec)

Build the complete product described in the spec: monitoring site + structured dataset + AI-assisted 24h pipeline + historical compare + Activity Index + open data.

| Area | In scope |
| --- | --- |
| Public site | Latest, Map, Exercises, Air Activity, Historical Comparison (`/historical`, with a side-by-side view at `/historical/compare`), Archive, Sources, Methodology, About; homepage panels (regional activity, 24h snapshot, map, latest events, historical signal, active exercises, 30-day trend, post-exercise reset) |
| Data | Full event model, 25-type taxonomy, exercises + reset dimensions, source registry + M2M, historical corpus (Aug 2020–Feb 2022) |
| Pipeline | Collect → normalize → extract → dedupe → contradict → classify → confidence → historical compare → human review → publish → daily digest |
| Analytics | Post-exercise reset widget, Activity Index + documented scoring, indicator matrix, analogues |
| Open data | JSON API, CSV export, source export, methodology + contributor docs |
| Repo | Single Next.js app + top-level `workers/`, `data/`, `docs/` (see §3; overrides §42 monorepo) |

Phase order follows spec §61 (Foundation → Automation → Monitoring → Historical data → Compare → Index → Public data tools).

---

## 2. PostgreSQL schema (full)

Normalize sources via `sources` + `event_sources` (M2M). Event rows still carry the §24 source snapshot fields (primary-source denormalization for queries/export). PostGIS for `latitude`/`longitude`. Enums as Postgres enums.

### Enums

| Enum | Values |
| --- | --- |
| `event_type` | `EXERCISE`, `READINESS_CHECK`, `MOBILIZATION`, `TROOP_MOVEMENT`, `EQUIPMENT_MOVEMENT`, `RAIL_ACTIVITY`, `LOGISTICS`, `AIR_ACTIVITY`, `NAVAL_ACTIVITY`, `AIR_DEFENSE`, `MISSILE_ACTIVITY`, `ENGINEERING`, `AIRFIELD_ACTIVITY`, `COMMAND_CONTROL`, `ELECTRONIC_WARFARE`, `BORDER_INCIDENT`, `AIRSPACE_VIOLATION`, `DRONE_ACTIVITY`, `NATO_REINFORCEMENT`, `RUSSIAN_DEPLOYMENT`, `BELARUSIAN_DEPLOYMENT`, `INFRASTRUCTURE`, `OFFICIAL_WARNING`, `POLITICAL_SIGNALING` (24 — the full list in spec §25; see Note 13) |
| `exercise_status` | `ANNOUNCED`, `UPCOMING`, `ACTIVE`, `CONCLUDING`, `CONCLUDED`, `EXTENDED`, `UNCLEAR` |
| `reset_status` | `FULL_RESET`, `PERSONNEL_RETURNED`, `EQUIPMENT_STATUS_UNKNOWN`, `PARTIAL_RESET`, `RESIDUAL_ACTIVITY`, `INCOMPLETE_RESET`, `CONTINUED_DEPLOYMENT`, `UNKNOWN` |
| `dimension_status` | `RETURNED`, `NOT_RETURNED`, `REMOVED`, `PRESENT`, `UNKNOWN`, `NOT_VERIFIED` — used for personnel / equipment / infrastructure widget dimensions (§18) |
| `confidence_level` | `CONFIRMED`, `HIGH`, `MODERATE`, `UNVERIFIED` |
| `source_type` | `OFFICIAL_GOVERNMENT`, `OFFICIAL_MILITARY`, `INDEPENDENT_ANALYSIS`, `ESTABLISHED_MEDIA`, `OSINT`, `UNKNOWN` |
| `source_reliability` | `HIGH`, `MEDIUM`, `LOW`, `UNRATED` (standing trust of outlet; see Notes) |
| `review_status` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `REJECTED`, `MERGED` |
| `review_action` | `APPROVE`, `EDIT`, `REJECT`, `MERGE` |
| `source_relationship` | `SUPPORTS`, `CONTRADICTS` — how an attached source bears on the event (§34) |
| `location_precision` | `EXACT`, `BASE`, `DISTRICT`, `REGION` |

### `sources`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | Display name |
| `home_url` | `text` | Org/outlet canonical URL |
| `source_type` | `source_type` | Tier labeling |
| `source_country` | `text` | |
| `source_language` | `text` | |
| `reliability` | `source_reliability` | Outlet-level |
| `tier` | `smallint` | 1–4 per §§26–29 |
| `notes` | `text` | e.g. state-source caveat |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `events` (spec §24 — all fields)

| Column | Type | Notes |
| --- | --- | --- |
| `event_id` | `uuid` PK | Public stable id |
| `event_date` | `date` NOT NULL | Activity date |
| `reported_date` | `date` | When reported |
| `headline` | `text` NOT NULL | |
| `summary` | `text` | |
| `actor` | `text` | |
| `country` | `text` | |
| `region` | `text` | |
| `location_name` | `text` | Generalized / as-reported |
| `location_precision` | `location_precision` | Nullable; how precise the reported location is |
| `latitude` | `double precision` | Nullable; PostGIS point optional generated col |
| `longitude` | `double precision` | Nullable |
| `geom` | `geography(Point,4326)` | PostGIS; from lat/lon when present |
| `event_type` | `event_type` NOT NULL | |
| `event_subtype` | `text` | Free or later controlled |
| `exercise_id` | `uuid` FK → `exercises` | Nullable link |
| `exercise_name` | `text` | §24 field (may mirror linked exercise) |
| `exercise_status` | `exercise_status` | Nullable on non-exercise events |
| `unit_name` | `text` | |
| `unit_type` | `text` | |
| `unit_home_location` | `text` | |
| `personnel_estimate` | `text` | Text/int-as-text for ranges |
| `equipment_type` | `text` | |
| `equipment_quantity` | `text` | |
| `activity_description` | `text` | |
| `source_name` | `text` | Primary source snapshot (§24) |
| `source_url` | `text` | Primary article URL |
| `source_type` | `source_type` | Primary |
| `source_country` | `text` | |
| `source_language` | `text` | |
| `source_reliability` | `source_reliability` | Primary snapshot |
| `confidence_level` | `confidence_level` | Claim confidence |
| `first_reported` | `timestamptz` | |
| `last_updated` | `timestamptz` | |
| `announced_start_date` | `date` | |
| `announced_end_date` | `date` | |
| `observed_start_date` | `date` | |
| `observed_end_date` | `date` | |
| `personnel_return_status` | `dimension_status` | Reset dimension |
| `equipment_return_status` | `dimension_status` | |
| `infrastructure_status` | `dimension_status` | Temp infra / airfields |
| `follow_on_activity` | `text` | |
| `overall_reset_status` | `reset_status` | Overall (§4 list) |
| `historical_analogue` | `text` | |
| `historical_notes` | `text` | |
| `ai_generated_summary` | `text` | |
| `human_reviewed` | `boolean` DEFAULT false | |
| `review_status` | `review_status` | Moderation gate |
| `contradiction_flag` | `boolean` DEFAULT false | From §34 pipeline |
| `contradiction_notes` | `text` | What conflicts and between which sources |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Published events require ≥1 `event_sources` row with `relationship = SUPPORTS` (enforced in the DB by a deferred constraint trigger).

### `event_sources` (M2M)

| Column | Type | Notes |
| --- | --- | --- |
| `event_id` | `uuid` FK | |
| `source_id` | `uuid` FK | |
| `article_url` | `text` | Specific item |
| `relationship` | `source_relationship` NOT NULL DEFAULT `SUPPORTS` | Preserves both sides of a contradiction; a `CONTRADICTS` row cannot be `is_primary` |
| `is_primary` | `boolean` | Drives event `source_*` snapshot |
| `excerpt` | `text` | Attributed quote |
| `created_at` | `timestamptz` | |
| PK | surrogate `id` | Unique `(event_id, source_id, article_url)` |

### `exercises` (spec §17 + reset §4 / §18)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `exercise_name` | `text` NOT NULL | |
| `actor` | `text` | |
| `countries` | `text[]` | |
| `location` | `text` | |
| `participating_units` | `text` | |
| `estimated_personnel` | `text` | |
| `equipment` | `text` | |
| `announced_start_date` | `date` | |
| `announced_end_date` | `date` | |
| `observed_start_date` | `date` | |
| `observed_end_date` | `date` | |
| `exercise_status` | `exercise_status` | |
| `exercise_objectives` | `text` | |
| `post_exercise_reset` | `reset_status` | Overall (§4 eight values) |
| `personnel_return_status` | `dimension_status` | Widget §18 |
| `equipment_return_status` | `dimension_status` | |
| `infrastructure_status` | `dimension_status` | |
| `follow_on_activity` | `text` | |
| `summary` | `text` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Exercise↔source: `exercise_sources (exercise_id, source_id, article_url, is_primary, excerpt)`, same shape as `event_sources`, for §17 `source`.

### `review_actions` (audit log; decisions.md #6)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `event_id` | `uuid` FK → `events` | `ON DELETE RESTRICT` so the log is never orphaned |
| `action` | `review_action` | `APPROVE`, `EDIT`, `REJECT`, `MERGE` |
| `reviewer` | `text` NOT NULL | |
| `event_type` | `event_type` NOT NULL | Captured at action time (accuracy by type) |
| `source_ids` | `uuid[]` NOT NULL DEFAULT `{}` | Sources attached at action time (accuracy by source) |
| `merged_into_event_id` | `uuid` FK → `events` | Required when `action = MERGE`, otherwise null; not self |
| `previous_values` | `jsonb` | Event field values before the action |
| `created_at` | `timestamptz` | |

Append-only (update/delete blocked by trigger). A merged-away event gets `review_status = MERGED`.

### Supporting (pipeline / digest)

| Table | Purpose |
| --- | --- |
| `raw_documents` | Collected source text + metadata (§31) |
| `extraction_runs` | Claude job audit |
| `daily_digests` | Date, structured sections (§16), status, body |
| `activity_index_snapshots` | Date, score, dimension JSON, formula version (§23) |

---

## 3. Repository structure

**Decided:** single Next.js app (not a monorepo). Admin is a protected route group in the same app. Keep `workers/`, `data/`, and `docs/` as top-level folders. Shared code lives under `src/`.

```
/
  src/                    # Next.js app (App Router)
    app/
      (public pages)
      admin/              # Protected route group — auth on every page + API
    components/
    lib/
  workers/
    collector/
    extractor/
    deduplication/
    digest/
    historical-comparison/
  data/
    sources/
    taxonomy/
    historical/
  docs/
    methodology.md
    scoring.md
    sources.md
    contributing.md
```

---

## 4. Roadmap (spec §61)

Each step ≈ one sitting, ends runnable. Order within a phase is suggested; every phase-1..7 feature appears.

### Phase 1 — Foundation

| Step | Runnable end state |
| --- | --- |
| **1.1** | Single Next.js app scaffold; top-level `workers/`, `data/`, `docs/`; design tokens (§47–51); shell nav (all primary routes stubbed); `/admin` protected route group stub |
| **1.2** | DB migration `src/db/migrations/0001_initial_schema.sql` (enums, sources, exercises, exercise_sources, events, event_sources, review_actions, daily_digests stub); PostGIS enabled. SQL approved with changes (review_actions event_type/source_ids/merged_into, MERGED status, source relationship, contradiction_notes, location_precision); Toshiana applies it to the Neon branch |
| **1.3** | `/admin` source registry: list, create, edit (all `sources` columns); public `/sources` grouped by tier with "State / official source" label. No seed data — Toshiana chooses the sources |
| **1.4** | Admin manual event create/edit with full §24 fields + attach M2M sources; taxonomy select (24 types) |
| **1.5** | Review queue: approve / edit / reject / merge / confidence / category; only `PUBLISHED` public |
| **1.6** | Public Latest feed + event detail (log-style §14); Sources page |
| **1.7** | Homepage shell: header, regional activity panel placeholder, 24h snapshot counts, latest list (no marketing hero) |
| **1.8** | Daily digest **page** (manual/admin-authored body, §16 section structure) |
| **1.9** | Basic Archive (date, country, actor, category, confidence, source type) + persistent URLs |
| **1.10** | Methodology + About (core question, AI disclosure placeholder, source hierarchy, “similarity ≠ trajectory”) |

### Phase 2 — Initial Automation

| Step | Runnable end state |
| --- | --- |
| **2.1** | Wire 5–10 feeds (LT MOD, LT AF, PL MOD, NATO, iSANS, OSW, Reuters, etc.) into `workers/collector` → `raw_documents` |
| **2.2** | `workers/extractor`: Claude → candidate JSON → `PENDING_REVIEW` events (`ai_generated_summary` filled) |
| **2.3** | Deduplication worker: suggest merges / multi-source attach; admin merge action |
| **2.4** | Contradiction detection: flag + preserve both sources; queue for review (§34) |
| **2.5** | Source classification + confidence assessment steps in pipeline (§35–36); still human-gated publish |
| **2.6** | Scheduler (GitHub Actions or cron): one daily cycle skeleton (§44) populating moderation queue |
| **2.7** | `workers/digest`: Claude daily digest from **approved** events only (§39); writes `daily_digests`; public digest page renders it |

### Phase 3 — Monitoring Features

| Step | Runnable end state |
| --- | --- |
| **3.1** | Interactive MapLibre map (homepage + Map page); markers by `event_type`; preview popover; generalized locations |
| **3.2** | Exercise tracker pages + admin CRUD (full §17 fields) |
| **3.3** | Post-exercise reset widget (§18) on exercise detail + homepage; all §4 statuses + dimension rows |
| **3.4** | Air Activity page: intercepts, types, Kaliningrad-related, weekly/monthly charts (§19) |
| **3.5** | Event filtering across Archive/Latest/Map; 30-day activity timeline toggles (§20) |
| **3.6** | Homepage complete: historical signal panel, active exercises, trend, reset callout (§10–15) |

### Phase 4 — Historical Dataset

| Step | Runnable end state |
| --- | --- |
| **4.1** | Load Jan–Apr 2021 historical events/exercises under `/data/historical` |
| **4.2** | Expand corpus backward to Aug 2020 |
| **4.3** | Expand forward through Feb 2022; phase tags (Phase 0–4 framework as metadata, not predictions) |

### Phase 5 — Historical Compare

| Step | Runnable end state |
| --- | --- |
| **5.1** | Side-by-side view (`/historical/compare`): default Jan–Feb 2021 vs current window |
| **5.2** | Synchronized dual timelines |
| **5.3** | Indicator matrix (§22) |
| **5.4** | Analogues + similarity/difference summaries; pipeline step §37 writes `historical_*` fields; disclaimer always visible |

### Phase 6 — Activity Index

| Step | Runnable end state |
| --- | --- |
| **6.1** | Document formula in `docs/scoring.md` (dimensions §23) |
| **6.2** | Compute + store snapshots; homepage Regional Activity uses index; permanent non-forecast disclaimer |

### Phase 7 — Public Data Tools

| Step | Runnable end state |
| --- | --- |
| **7.1** | Public read-only JSON API (`/api/events` filters) |
| **7.2** | CSV download of published events |
| **7.3** | Source export |
| **7.4** | Finalize public methodology + contributor docs (`docs/*`); license chosen |

### Coverage check (feature → step)

| Spec feature | Step(s) |
| --- | --- |
| Next.js app / design system / nav | 1.1 |
| Database + full event schema + PostGIS | 1.2 |
| Source registry | 1.3 |
| Manual event creation (full fields, 24 types) | 1.4 |
| Admin dashboard / moderation | 1.5 |
| Latest + event detail | 1.6 |
| Homepage (foundation) | 1.7 |
| Daily digest page | 1.8 |
| Basic archive | 1.9 |
| Methodology / About / AI disclosure | 1.10, 7.4 |
| Source collector (5–10 sources) | 2.1 |
| Claude extraction | 2.2 |
| Deduplication | 2.3 |
| Contradiction detection | 2.4 |
| Classify source + assess confidence | 2.5 |
| 24h schedule | 2.6 |
| AI daily digest generation (post-approval) | 2.7 |
| Interactive map (MapLibre) | 3.1 |
| Exercise tracker | 3.2 |
| Post-exercise reset widget | 3.3 |
| Air Activity page | 3.4 |
| Event filtering + 30-day timeline | 3.5 |
| Homepage monitoring panels (signal, trend, reset) | 3.6 |
| Historical dataset Jan–Apr 2021 | 4.1 |
| Expand Aug 2020 ↔ Feb 2022 | 4.2–4.3 |
| Side-by-side view + timelines + matrix + analogues | 5.1–5.4 |
| Activity Index + scoring docs | 6.1–6.2 |
| JSON API / CSV / source export | 7.1–7.3 |
| Contributor docs + open methodology finalize | 7.4 |
| Workers (collector, extractor, dedup, digest, historical-comparison) | 2.1–2.7, 5.4 |
| Repo structure (single app + workers/data/docs) | 1.1 |

---

## 5. Notes for Toshiana to decide

Flag only — schema and roadmap above follow the spec as written.

1. **Reliability vs confidence:** Spec has both `source_reliability` and `confidence_level`. Worth treating as separate concepts (outlet trust vs claim support), including for state MoD sources that are “official” but not independently verified — confirm editorial rules.
2. **Reset status overlap:** ~~Decide whether to keep all eight.~~ **Decided:** keep all 8 from §4, plus dimension fields.
3. **`EQUIPMENT_STATUS_UNKNOWN` as overall status:** Sits beside dimension field `equipment_return_status`; clarify when to use the overall enum vs dimension only.
4. **Event `source_*` columns + M2M:** Full §24 kept plus `event_sources`. Decide whether primary snapshot is always copied from `is_primary` join (recommended) or edited independently.
5. **PostGIS on day one:** ~~Delay?~~ **Decided:** yes, from the start.
6. **Activity Index misread risk:** Even with disclaimer, a 0–100 score can look like a war meter. Confirm homepage prominence and copy.
7. **Historical Signal / “current analogue”:** Powerful but can imply trajectory; confirm disclaimer placement and whether analogue is human-set or model-suggested.
8. **Monorepo vs single app:** ~~§42 monorepo.~~ **Decided:** single Next.js app; `workers/`, `data/`, `docs/` at root; shared code under `src/`.
9. **Admin app split:** ~~Two Next apps.~~ **Decided:** `/admin` protected route group in the same app; auth on every admin page and API route.
10. **Solo 24h SLA:** Full UTC pipeline + same-day human review may slip; confirm whether “queue ready by morning” is enough vs hard publish SLA.
11. **License:** Still open — MIT vs Apache 2.0.
12. **Dimension enum vs free text:** Plan uses `dimension_status` for widget clarity; spec example is checkmark/copy — confirm enum values (`NOT_VERIFIED` vs `UNKNOWN`).
13. **Taxonomy count:** ~~24 vs 25?~~ **Decided:** 24 types as listed in spec §25.
14. **Review policy:** **Decided:** all AI-extracted events require human review at launch; log approve/edit/reject with source and event type; revisit auto-publish for structured official sources later.

---

## 6. Spec risks / ambiguities (informational)

- Homepage mock (§10) includes Activity Index + Historical Signal before Phases 5–6 data exists — UI can show empty/placeholder states until those phases land.
- Rules file: ask on conflicts rather than silent decisions (see Notes above).
- OPSEC (§60): map and coords must stay generalized/public/delayed.
- Dedup and contradiction quality depend on prompts + review discipline more than schema.
