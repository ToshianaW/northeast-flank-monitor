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
