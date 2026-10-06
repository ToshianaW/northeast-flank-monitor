# Running costs

The project runs on free tiers only and must never incur charges. No payment method should be added to any of these accounts: on each of them, the free tier then stops or pauses instead of billing. Figures checked on 2026-10-04 against the providers' documentation (links below); recheck before relying on them.

## Vercel Hobby (site and API)

Free, non-commercial personal use. Included per month ([Hobby plan](https://vercel.com/docs/plans/hobby)):

| Resource | Included |
| --- | --- |
| CDN requests | 1,000,000 |
| Fast Data Transfer | 100 GB |
| Fast Origin Transfer | 10 GB |
| Function invocations | 1,000,000 |
| Active CPU | 4 CPU-hours |
| Provisioned memory | 360 GB-hours |
| Image transformations | 5,000 |
| Deployments | 100 per day |
| Function maximum duration | 300 s |
| WAF custom rules | up to 3 (WAF rate limiting: 1 rule per project, 1,000,000 allowed requests) |

**At the limit:** no charge; usage is paused. "If you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again."

## Neon Free (PostgreSQL)

Per project ([plans](https://neon.com/docs/introduction/plans)): 100 CU-hours of compute a month, 1 GB storage (20 GB per account), 5 GB public network transfer a month; compute scales to zero after 5 minutes idle (cannot be disabled).

**At the limit:** no charge. When compute hours or network transfer run out, "your compute is suspended until the next billing period or until you upgrade"; when storage is full, writes that add storage fail. No data is deleted.

## GitHub Actions (public repository)

The pipeline (every hour at :17, 24 runs a day, roughly 3–6 minutes each; runs never overlap, and at most one waits) and the daily digest run on GitHub-hosted standard runners. "GitHub Actions usage is free … for public repositories that use standard GitHub-hosted runners" ([billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). Larger runners are always charged and must not be used. If the repository were made private, the Free plan includes 2,000 minutes a month and usage is blocked at the quota when no payment method is on file.

## Anthropic API (not a free tier)

Model calls (extraction, dedup judge, digest drafting) are paid per token and capped in code. Target: automated spend at or under about $27 a month in the worst case.

| | Rule (in code) | Worst case, 31 days |
| --- | --- | --- |
| Extractor | at most $0.12 per run, and at most $0.60 in any rolling 24 hours (`workers/extractor/budget.mts`; spend read from `extraction_runs`) | $18.60 |
| Digest | at most $0.15 per run, one scheduled run a day; the one automatic retry after a failed check fits inside it up to about 30,000 characters of event input (about 39 events; the largest day so far is 11). Above that the retry is refused rather than exceeding the cap | $4.65 |
| Dedup judge | at most $0.01 per run, 12 runs a day; past the cap, borderline pairs fall back to similarity only | $3.72 |
| **Total** | | **$26.97** |

Manual reruns add at most $0.15 (digest) or $0.01 (dedup) each; manual extractor runs stay inside the same rolling 24-hour budget. The optional reference suggestion step is off by default ($0.02 per click when on). The open-data API, the map, the Activity Index and automatic historical links make no model calls. Each pipeline run's job summary shows "API spend: last 24 h · last 30 days" from the recorded costs (extraction_runs, dedup_runs and each AI digest's `_meta.cost_usd`). Digests drafted before 5 October 2026, and digest runs that end without a saved draft, have no recorded cost; the line says how many digests it leaves out. If the query fails, the line reads "API spend: unavailable" and the job carries on.

**Outside backstops** (set in the Anthropic Console, not in code):

- A monthly **spend limit** on the organisation, at or a little above the ceiling above.
- **Prepaid credits with auto-reload off**, so the API stops when the credit runs out instead of billing a card.

## What the open-data API could hit

All responses except errors are cached by the CDN for an hour. A function runs, and the database is queried, only on a cache miss.

- **CDN requests (1,000,000/month):** every API request counts, cached or not. This is the most plausible limit under heavy scraping.
- **Fast Data Transfer (100 GB/month):** a 200-event JSON page or a 2,000-row CSV is at most a few MB, so roughly tens of thousands of full downloads.
- **Function invocations (1,000,000/month) and Active CPU (4 CPU-hours/month):** only on cache misses. Many distinct query strings, for example sweeping date ranges and cursors, are the realistic way to reach them.
- **Neon compute (100 CU-hours/month):** cache misses wake the database, which then stays up for 5 minutes. Steady misses spread across the day keep it awake.

If any of these approach their limit, add the one Hobby WAF rate-limiting rule for `/api/*` before anything else.
