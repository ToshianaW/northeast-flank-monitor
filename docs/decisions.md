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
