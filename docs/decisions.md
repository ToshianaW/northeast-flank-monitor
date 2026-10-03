# Decisions (these override docs/mvp-plan.md where they conflict)

1. Repo: single Next.js app with folders mirroring spec section 42 (workers/, data/, docs/ at the root; shared code under src/). Not a monorepo.
2. Admin: route group inside the web app, behind authentication on every page and API route.
3. PostGIS: yes, from the start.
4. Reset statuses: keep all 8 from spec section 4, plus the dimension fields.
5. License: [MIT / Apache 2.0]
6. Review policy: all AI-extracted events require human review at launch. Log every
   approve/edit/reject with source and event type so accuracy can be measured. Revisit
   auto-publishing for structured official sources once there is data.
7. Taxonomy: 24 types as listed in spec section 25.
8. Workers language: TypeScript, not Python (overrides spec section 43). Workers live under workers/ and run with tsx, sharing Node, pg, and tooling with the web app. Decided at step 2.1; Python was not installed and one toolchain is simpler to maintain.
9. No automated Telegram or Discord collection. Telegram's Content Licensing and AI Scraping terms and API terms §1.5 prohibit automated aggregation and AI use of platform data; Discord forbids self-bots and only allows bots invited by a server's admins. No Telegram migration, collector, or manual lead form is to be built.
10. Tier 4 publishing rule (for the review/approve step; to implement later): an event whose only SUPPORTS sources are Tier 4 cannot be published. It needs at least one Tier 1-3 supporting source.
11. Positions from Tier 4 sources: when a Tier 4 source reports a precise or current position, set location precision to District or Region, remove coordinates, and hold publication for 72 hours. Positions reported by official sources or established media can be shown as the source reported them.
12. Contradiction detection (MVP step 2.4) stays a reviewer action at launch: the reviewer sets `contradiction_flag`, its notes, and CONTRADICTS sources. Revisit when volume exceeds about 20 approvals a day, or after a contradiction is missed.
13. Confidence assessment (MVP step 2.5) is covered by the reviewer's choice at approval. The approve form shows a rule-based suggestion from the attached sources' tiers and types (no AI call); the reviewer decides.
14. Map dots (amends spec section 60 for the regional map only; requested and approved by the project owner). The map may draw one dot per area (a country, Kaliningrad Oblast, western Russia, the Baltic Sea, the Gulf of Finland) or per admin-1 region, at a fixed, hand-set anchor stored in data/map-anchors.json. Anchors are chosen once, in open land or sea away from towns and known military sites, rounded to 0.1 degrees, and never derived from, moved by, or jittered for events. Only the dot's size and colour change, in three count steps on an amber-to-orange heat scale (src/lib/map-style.ts, HEAT_SCALE; no red). The scale shows reporting volume, not intensity of activity, and the legend keeps the notes "Each dot marks an area, not a location." and "Counts reflect reporting, not intensity of activity." A dot marks an area, not a location. No per-event markers, no centroids of events, and no event coordinates reach the client. The rule against showing precise or current positions is unchanged, and the 72-hour exclusion of items supported only by Tier 4 sources still applies to the map. Items about places outside the theater are counted in cards beside the map, with no dots.
