# Implementation Overview

This document captures the state of the Lab Table Tennis League tracker as implemented in this iteration. It mirrors the roadmap from `AGENTS.md` and identifies which capabilities are complete, plus notable gaps still open.

## Platform Snapshot

- **Framework**: Next.js 14 (App Router) with TypeScript and Tailwind CSS.
- **Authentication**: NextAuth (Google + GitHub providers) with Prisma adapter and email allowlist enforcement via middleware.
- **Database**: PostgreSQL accessed through Prisma; schema covers users, matches, rating history, audit logs, and allowlist entries.
- **Ratings**: Custom Glicko-2 module (singles + doubles) with replayable recompute pipeline.
- **Deployment assets**: Production Dockerfile, docker-compose for local Postgres, Prisma migration/seed scripts, and environment template.

## Feature Delivery Status

| Roadmap area                            | Status | Notes |
| --------------------------------------- | ------ | ----- |
| Auth + allowlist foundations            | ✅     | OAuth sign-in, middleware gate, allowlist CRUD UI/API, audit log on sign-in (`src/server/auth.ts`, `src/app/(dashboard)/admin/page.tsx`). |
| Match submission & auto-confirmation    | ✅     | Zod validation, instant rating updates, dispute tooling, audit entries, client form with doubles support (`src/features/matches/submit-form.tsx`, `src/app/api/matches/**/*.ts`). |
| Glicko-2 rating engine & profiles       | ✅     | Singles/doubles updates, rating history, head-to-head summaries, player page with sparkline (`src/server/rating-engine.ts`, `src/features/players/rating-sparkline.tsx`). |
| Leaderboard & history views             | ✅     | Dynamic tables, filters, recent matches modules (`src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/history/page.tsx`). |
| Admin tooling & recompute               | ✅     | Allowlist manager, recompute endpoint, audit logs, middleware protection (`src/app/api/admin/**/*.ts`, `src/server/recompute.ts`). |
| Data seeding & migrations               | ✅     | Initial SQL migration, seed script with sample players/matches + recompute (`prisma/migrations/0001_init`, `prisma/seed.ts`). |
| Ops & docs (README, Docker, env)        | ✅     | Updated README, `.env.example`, Dockerfile, docker-compose, lint/build scripts. |

## Known Follow-ups

- Extend recompute API with progress tracking and dry-run diff output.
- Add rate limiting and observability (metrics/log forwarding) for production readiness.
- Implement doubles-specific leaderboards and partner statistics as described in roadmap.
- Introduce integration/e2e tests (Playwright) for critical flows.

## File Map Highlights

- `src/app` – App Router routes (dashboard sections, auth, admin) and API handlers.
- `src/features` – Client components (match submission, allowlist, player visuals).
- `src/lib` – Prisma client singleton, Glicko helpers, validation schemas, utilities.
- `src/server` – Auth wiring, rating engine, recompute service, league read queries.
- `prisma` – Database schema, SQL migration, data seeding.

Refer back to `README.md` for setup/deployment instructions and to `AGENTS.md` for the original specification.
