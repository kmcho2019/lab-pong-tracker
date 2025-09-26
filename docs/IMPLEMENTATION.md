# Implementation Overview

This document captures the state of the Lab Table Tennis League tracker as implemented in this iteration. It mirrors the roadmap from `AGENTS.md` and identifies which capabilities are complete, plus notable gaps still open.

## Platform Snapshot

- **Framework**: Next.js 14 (App Router) with TypeScript and Tailwind CSS.
- **Authentication**: NextAuth (Google + GitHub providers) with Prisma adapter and email allowlist enforcement via middleware.
- **Database**: PostgreSQL accessed through Prisma; schema covers users, matches, rating history, audit logs, and allowlist entries.
- **Ratings**: Custom Glicko-2 module (singles + doubles) with replayable recompute pipeline.
- **Deployment assets**: Production Dockerfile, docker-compose for local Postgres, Prisma migration/seed scripts, and environment template.
- **Dev container**: VS Code configuration in `.devcontainer/` boots a Node 18 workspace with a Postgres sidecar for an instant remote development environment.

## Feature Delivery Status

| Roadmap area                            | Status | Notes |
| --------------------------------------- | ------ | ----- |
| Auth + allowlist foundations            | ✅     | OAuth sign-in, middleware gate, allowlist CRUD UI/API, audit log on sign-in (`src/server/auth.ts`, `src/app/(dashboard)/admin/page.tsx`). |
| Match submission & auto-confirmation    | ✅     | Zod validation, instant rating updates, dispute tooling, audit entries, client form with doubles support, KST timezone helpers, admin edit/cancel UI (`src/features/matches/submit-form.tsx`, `src/app/api/matches/**/*.ts`). |
| Glicko-2 rating engine & profiles       | ✅     | Singles/doubles updates, rating history, head-to-head summaries, player page with sparkline (`src/server/rating-engine.ts`, `src/features/players/rating-sparkline.tsx`). |
| Leaderboard & history views             | ✅     | Dynamic tables, filters, recent matches modules with Overall/Singles/Doubles tabs (`src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/history/page.tsx`). |
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

## Timezone Handling

- Shared Day.js utility (`src/utils/time.ts`) pins the default zone to Asia/Seoul and provides `toLeagueIso` for submissions.
- All UI formatters call `formatDate`/`formatDistanceToNow` so timestamps remain consistent across SSR and client hydration.
- Tests cover the conversion helpers (`tests/time.test.ts`).

## Rating Presentation Enhancements

- History and profile tables now show rating before → after plus deltas for each participant.
- Player sparkline renders axes, gridlines, hover tooltip, and KST timestamps for easier analysis.
- Head-to-head summaries include singles-only breakdown built in `getPlayerProfile`.
- Sparkline now supports switching the x-axis between chronological time and match index with a ±2 RD confidence band shaded for each point.
- Rating tabs now hydrate singles and doubles with mode-specific rating history and match snapshots so graphs and tables reflect the correct ladder.
- Rating updates append a `RATINGS_APPLIED` audit log per match capturing before/after rating + RD deltas for every participant, grouped by mode.
- Profile sparkline now renders a regression trend line, color-coded trend badge, and legend; axis ticks re-key by mode so labels no longer linger when toggling between date and match index views.

## Admin Match Management

- `/admin` exposes a Match Management panel for editing or cancelling confirmed matches.
- Edits call the REST endpoint (`PATCH /api/admin/matches/:id`) which rebuilds participants, logs the change, and triggers a full recompute.
- Cancellations hit (`DELETE /api/admin/matches/:id`), mark the match as `CANCELLED`, and rerun the ladder so historical ratings stay accurate.

## Tournament Management

- The admin console includes a tournament manager that sorts entrants by overall rating, segments them into contiguous groups to keep skill ranges tight, and builds round-robin schedules. **Standard** events still let admins choose between per-player match quotas or total games per group, while the new **Competitive monthly** format locks in a fixed number of round-robin iterations, auto-balances doubles pairings, and enforces even match counts for every participant inside a group.
- Admins can rename groups, tweak table assignments, reassign players, and edit match pairings/schedules before saving; validation ensures players stay within one group and teams match the tournament mode.
- Competitive monthly events surface per-group standings (wins/losses, points for/against, differential, rank) in both the admin dashboard and the public detail page so podium results are available immediately after the final game.
- Status controls—Scheduled, Active, Completed, Cancelled—drive reporting permissions. Completed events archive automatically when every matchup has a recorded result.
- Reporting a tournament matchup runs through `POST /api/tournaments/:id/matches/:matchId/report`, creates a confirmed `Match` with participants, writes an audit entry, advances ratings, and closes the pairing. Admins and participants on the matchup can submit results while the tournament is Active.
- Public routes (`/tournaments` and `/tournaments/[id]`) surface group rosters, matchups, and live results; authorised users can report scores inline with optimistic feedback.

## Automatic migrations

- `scripts/ensure-migrate.js` runs before `npm run start` to apply pending Prisma migrations.
- Disable with `SKIP_PRISMA_MIGRATE=1` or enforce failure with `PRISMA_AUTO_MIGRATE_STRICT=1`.
- Migrations now trigger a ratings replay by default; set `PRISMA_AUTO_RECOMPUTE=0` to skip the recompute step.
- Docker and CI environments can rely on this hook instead of manual migrate commands.
