# Activity Index scoring

Formula version: `activity-index-v1` (`src/lib/activity-index.ts`, tested in `src/lib/activity-index.test.mts`).

> The Northeast Flank Activity Index measures observable military activity and force posture. It does not estimate the probability of conflict or predict political intent.

The Index is not a score, a threat level or a forecast. It says whether the number of reported activity events in the last four weeks is more than, fewer than, or within the usual range of the same scope's previous eight weeks.

## Inputs

- **Published current events only.** Drafts, rejected and merged events are never counted.
- **Historical data never enters the Index.** The hand-entered historical record (Aug 2020 – Feb 2022) and automated current collection are counted in different ways, so their counts are never compared or combined. The Index code reads no historical table (enforced by `src/lib/historical.static.test.mts`).
- **Statements are excluded**, as on the map: `POLITICAL_SIGNALING` and `OFFICIAL_WARNING` belong to no dimension and are not counted.
- **Stable source panel.** An event counts only if at least one of its SUPPORTS sources was already in the source registry (`sources.created_at`, UTC date) before the baseline began. A source added later cannot raise the count until a later comparison whose baseline begins after it was added. The registry has no separate "enabled since" date; `created_at` is the date a source was registered for collection.
- **Placement** uses the map's own placement (`placeEvent`): the scopes are the whole theater (the nine map areas plus theater-wide items) and each map area. Items about places outside the theater (Russia elsewhere, Ukraine, Western Europe, North America) and unplaced items are not counted.

## Windows

Weeks run Monday to Sunday (UTC). Collection began 1–4 October 2026, so week 1 starts on Monday 5 October 2026.

- **Window:** the last 4 complete weeks.
- **Baseline:** the 8 complete weeks before the window.

## Band rule

`expected = baseline events × 4 / 8` (the baseline's average per 4 weeks). Every event counts as 1; there are no weights.

- **More than usual:** window events ≥ 2 × expected **and** window events − expected ≥ 4.
- **Fewer than usual:** window events ≤ expected ÷ 2 **and** expected − window events ≥ 4.
- **Within the usual range:** anything else.

The page states the band, the window count and the baseline average, and a breakdown by dimension.

## Minimum data

- Until 12 complete weeks exist, the dashboard shows "Collecting baseline: week N of 12" and the disclaimer, never a number.
- After that, the theater is computed first. If the theater baseline has fewer than 12 counted activity events, the dashboard shows "Not yet calculated" with the baseline count.
- Each map area is shown only when its own baseline has at least 12 counted activity events.

## Dimensions (spec §23)

| Dimension | Event types |
| --- | --- |
| Exercise tempo | EXERCISE, READINESS_CHECK |
| Mobilization activity | MOBILIZATION |
| External deployments | RUSSIAN_DEPLOYMENT, BELARUSIAN_DEPLOYMENT, TROOP_MOVEMENT |
| Logistics | LOGISTICS, RAIL_ACTIVITY, EQUIPMENT_MOVEMENT, INFRASTRUCTURE, ENGINEERING |
| Air activity | AIR_ACTIVITY, AIRSPACE_VIOLATION, AIR_DEFENSE, AIRFIELD_ACTIVITY, DRONE_ACTIVITY, MISSILE_ACTIVITY |
| Command integration | COMMAND_CONTROL, ELECTRONIC_WARFARE |
| Border incidents | BORDER_INCIDENT |
| NATO posture | NATO_REINFORCEMENT, NAVAL_ACTIVITY |

Residual posture (spec §23) comes from the exercise reset fields, not from events, and is not part of v1.

## Display

Band words and counts only: no score, no arrows, no red or heat colours, and the disclaimer above verbatim wherever the Index appears.

## Snapshots

`npm run index:snapshot` stores each computed scope in `activity_index_snapshots` (migration 0012) with its windows, counts, band, dimensions and formula version, so a published value can be reproduced. While the Index is collecting, it stores nothing.
