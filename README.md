# Lab Table Tennis League Tracker

A full-stack Next.js application for our lab’s single-game table tennis league. Players authenticate via OAuth, log singles or doubles results, and watch Glicko-2 ratings evolve instantly on the leaderboard, history, and profile pages. Admins manage the allowlist, trigger league-wide recomputes, and audit every change.

> The original product specification (v2.1) remains below for reference. Everything above that line reflects the working implementation.

## Stack

- **Frontend**: Next.js App Router, Server Components, Tailwind.
- **API / Auth**: Next.js route handlers with NextAuth (Google + GitHub), allowlist enforcement.
- **Data**: PostgreSQL via Prisma with single-game match schema and audit trail.
- **Ratings**: In-process Glicko-2 engine with doubles support, rating history, and recompute utility.

## Feature Overview

- **Secure sign-in** with OAuth and email allowlist gate.
- **Single or double match submission** with win-by validation, rich form, optimistic UI, and instant rating updates.
- **Dispute workflow** (`CONFIRMED → DISPUTED/CANCELLED`) available to admins if an entry needs correction.
- **Match history & profiles** show rating before/after with deltas plus interactive KST-aware charts.
- **Leaderboards & history** showing rating, RD, streak, head-to-head records, and enriched match deltas. Filter between Overall, Singles, and Doubles without leaving the page.
- **Player spotlight** pages with rating sparklines, recent matches, and per-opponent summaries.
- **Admin console** to manage the allowlist, edit/cancel matches, and kick off deterministic league recomputes.

## Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   - Set `DATABASE_URL` to your Postgres instance (the provided `docker-compose.yml` runs PostgreSQL on port `5432`).
   - Generate a `NEXTAUTH_SECRET` (`openssl rand -base64 32`) and add OAuth client IDs/secrets.
3. **Start Postgres** (either locally or via Docker):
   ```bash
   docker compose up -d db
   ```
4. **Run Prisma migrations + seed demo data**
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
5. **Launch the dev server**
   ```bash
   npm run dev
   ```
   The app is available at <http://localhost:3000>. Sign in with an allowlisted email, submit a match, confirm it from the opponent’s account, and watch ratings update in real time.

> `npm run build` and any route that touches the database require a reachable `DATABASE_URL`. Keep the Postgres container running (or supply an external connection string) when building or running in production mode.

## Signing In

1. Visit `/auth/signin` or click **Sign in** in the header.
2. Choose Google or GitHub OAuth.
3. Only emails present in the allowlist are permitted:
   - Seeded via `EMAIL_ALLOWLIST` env var or the admin console.
   - If blocked, contact an admin to add your email at `/admin`.
4. After authentication, you are redirected to the leaderboard with your display name rating badge in the header.

> Admins are distinguished by the `role` column in the `User` table—set to `ADMIN` via seed or database update.

## Deployment Notes

- **Hosting**: Vercel, Fly.io, or any Node-capable platform. Ensure Postgres is reachable and `NEXTAUTH_URL` reflects the deployed URL.
- **Environment**: Provide OAuth credentials, `NEXTAUTH_SECRET`, and optionally `EMAIL_ALLOWLIST` for initial bootstrap.
- **Migrations**: Run `npm run prisma:migrate` (deploy) during deploy, followed by `npm run db:seed` if you need demo data.
- **Background tasks**: The recompute utility executes synchronously today; for high volume you can schedule it via a Cron job hitting `/api/admin/recompute`.

For platform-specific guidance (Vercel, Fly.io, Docker Compose), see [`docs/HOSTING.md`](docs/HOSTING.md). For database procedures, refer to [`docs/DB_OPERATIONS.md`](docs/DB_OPERATIONS.md). If you are new to environment variables, read [`docs/ENV_SETUP.md`](docs/ENV_SETUP.md). For a WSL2/Windows Docker walkthrough, see [`docs/LOCAL_DOCKER_GUIDE.md`](docs/LOCAL_DOCKER_GUIDE.md).

## Timezone Handling

- All match timestamps persist in UTC but render in Asia/Seoul (KST) using shared Day.js timezone helpers.
- The submit form converts local KST inputs via `toLeagueIso` before sending to the API.
- Dashboard widgets (history, profiles, charts) rely on the same helpers so dates match what players entered.

## Testing

- `npm run lint` – ESLint (Next.js config).
- `npm run test` – Vitest suite covering Glicko-2 helpers and payload validation.
- `npm run build` – Compiles and type-checks the application (requires the database to be reachable).

## Admin & Database Operations

### Automatic migrations

- `npm run start` now executes `scripts/ensure-migrate.js`, which runs `prisma migrate deploy` when `DATABASE_URL` is set.
- Set `SKIP_PRISMA_MIGRATE=1` or run `npm run start:strict` (fails hard on migration errors) to control behaviour.
- In Docker, the same script runs before `next start`, so local stacks pick up schema changes automatically.
- For CI/hosting, make sure credentials are available so the script can apply migrations before the app serves traffic.


### Match Management

- Visit `/admin` (admins only) to access the **Match Management** panel.
- Update scores, participants, or metadata—ratings recompute automatically after saving.
- Use *Cancel match* to soft-delete incorrect entries; recompute runs immediately to remove prior rating impact.
- All actions are captured in the audit log for traceability.

See [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) for allowlist management, recomputes, migration/backup procedures, and troubleshooting tips tailored for lab admins.


Below is an expanded, implementation‑ready specification that keeps your original vision intact while tightening rules, clarifying edge cases, and adding the pieces you’ll need to build confidently (schema details, API contracts, validation, and ops). I’ve preserved your sectioning and versioned this as **2.1** so you can diff easily.

---

## **Project Specification: Lab Table Tennis League**

* **Version:** 2.1 (expanded)
* **Date:** September 18, 2025

---

### **1. Project Overview**

#### **1.1. Vision (unchanged)**

A modern, secure web app to record singles and doubles results, compute **Glicko‑2** ratings in near‑real time, and surface personal/league‑wide stats that encourage friendly competition.

#### **1.2. Target Audience (unchanged)**

All lab members.

#### **1.3. Key Goals (clarified)**

* Accurate, auditable rating math (Glicko‑2) with transparent histories and “what changed when.”
* Strong data integrity: confirmations, edit trails, and safe recomputation when past results change.
* Low-friction UX on mobile directly after play.
* Access restricted to allowlisted, authenticated members.

**League Rules (new clarifications)**

* **Match formats supported:**

  * Singles: Best‑of‑3 or Best‑of‑5 to 11 (win by 2). Default **Best‑of‑5**.
  * Doubles: Same scoring rules.
* **Draws:** Not allowed (table tennis requires 2‑point margin).
* **Recording time:** Within 24 hours is encouraged (soft rule; not enforced by system).
* **Active player definition:** ≥ 1 match in the last 60 days (configurable). Only “active” appear on default leaderboard; toggle shows everyone.

---

### **2. Core Features & User Stories**

#### **2.1. Authentication & Profiles (expanded)**

**Stories (existing + expanded acceptance criteria)**

* **Auth via Google/GitHub**

  * *Acceptance:* New sign‑ins are blocked unless email is in allowlist. Admins can bypass allowlist for themselves.
  * *Implementation notes:* NextAuth/Auth.js OAuth, database session strategy, anti‑CSRF enabled.

* **Profile page**

  * Shows current rating, RD, volatility, rating interval (e.g., 95% CI), win/loss, win rate, streak, best win (highest opponent rating beaten), upset index (optional), recency.
  * Rating history chart with tooltips, match markers (hover to see opponent + delta).
  * Filters: **All**, **Singles**, **Doubles**.
  * “Provisional” badge if RD > threshold (e.g., 130) or fewer than N matches (default 5).

* **View others’ profiles**

  * Same as own profile but without private data (email hidden).
  * Quick “Head‑to‑Head” shortcut to prefill compare view.

**New stories**

* **Username claim/edit** (auto‑generated from email; unique, changeable by user once per 30 days).
* **Privacy knobs** (optional later): show/hide last active time.

#### **2.2. Match Result Management (expanded)**

**Submission flow**

* One player submits a match with: format (Bo3/Bo5), date played, players/teams, per‑game scores in order.
* Immediate validation (client + server):

  * Correct number of games; last game ends the series; each game must have ≥11 and win‑by‑2 margin (or **deuce** extension).
  * No self‑matches; no duplicate players on the same team; doubles require exactly two per side.
  * Forfeits/walkovers allowed via special result type (no game scores required).
* **Status workflow:**

  * Default policy: matches auto-confirm on submission (`CONFIRMED`) so standings update immediately.
  * Admin tooling can flip a record to `PENDING`, `DISPUTED`, or `CANCELLED` if an investigation or correction is needed.

**Auto-rating update**

* Ratings update **on submission** because matches are confirmed immediately.
* If the league ever re-enables manual confirmation, swap the flag and ratings will apply once a match returns to `CONFIRMED`.

**History & search**

* Filter by date range, player, opponent, singles/doubles, result type, status.
* Pagination (cursor‑based).
* Export CSV.
* Per-player rating journey appears inline (before → after with delta).

**Edit/Delete**

* Admin can edit/delete **any** result; action is logged and triggers recompute from the earliest affected match date.

#### **2.3. Rankings & Leaderboard (expanded)**

* Default view: **Active players** only; toggle to show all.
* Columns: Rank, Player, Rating (rounded; show ±RD), RD, Wins, Losses, Win Rate, Last Match.
* Tie‑breaks: Higher rating first; then lower RD; then most recent activity; then lower userId (stable).
* Filters: singles-only, doubles-only, or blended overall (see rating model below).

#### **2.4. Admin Panel (expanded)**

* **Allowlist management:** import CSV; add/remove; notes field.
* **User management:** elevate to admin, deactivate user (cannot log in; historical data remains).
* **Match moderation:** resolve disputes, edit scores/participants/date, delete matches.
* **Recompute controls:**

  * Recompute entire league or from a selected date; dry‑run mode shows expected rating changes before applying.
* **Settings:**

  * Match defaults (Bo5), confirmation policy, “active definition,” Glicko‑2 parameters (τ, initial RD/volatility), doubles method, seasons toggle.
* **Audit log:** who did what, when, and from where (IP).

---

### **3. Page & View Breakdown (expanded)**

* **`/login`**

  * OAuth buttons; show allowlist error if blocked.
  * Link to privacy policy (internal).

* **`/` Dashboard**

  * Panel cards: current rating & RD (with 95% interval), rank within active players, last 5 matches with deltas, “Submit Match” CTA, top‑5 leaderboard, quick links (My Profile, Rankings, History).
  * Surface the latest submissions with rating deltas for quick review.
  * Leaderboard tabs: Overall, Singles, Doubles.

* **`/submit`**

  * Tabs: Singles, Doubles.
  * Player pickers: searchable, show rating next to name; prevent duplicates.
  * Scores grid (game 1..N) with live validation (win‑by‑2).
  * Toggle “Forfeit/Walkover” (hides scores).
  * Date/time picker (defaults to now).
  * Summary panel: inferred winner, series score (e.g., 3–2).
  * On submit → toast + redirect to the match page.

* **`/rankings`**

  * Searchable/sortable table; sticky header; mobile‑friendly.
  * Toggle: Active only / All; Singles / Doubles / Overall.
  * CSV export.

* **`/history`**

  * Timeline cards with player avatars, series result, per‑game scores, delta bubbles (once confirmed).
  * Filters and pagination.
  * Admin: inline edit button.

* **`/players/{username}`**

  * Header: avatar, display name, username, badges (Provisional, Streak).
  * Rating line chart with Overall/Singles/Doubles tabs plus hover tooltips detailing opponent and score.
  * Stat tiles: W‑L, win rate, longest streak, recent form (last 10), best win, performance by day of week (optional).
  * Match list synced with the selected tab and deltas.
  * H2H quick selector.

* **`/compare?h2h=a,b`** (new)

  * Head‑to‑head totals, last 5, rating progression overlay, common doubles partners.

* **`/matches/{id}`** (new)

  * Detail page for a single match (status, participants, games, result type, rating deltas, audit snippet).
  * Confirm/Dispute buttons if applicable.

* **`/admin`**

  * Tabs: Overview, Allowlist, Users, Matches, Recompute, Settings, Audit Log.

---

### **4. Technical Specifications**

#### **4.1. Technology Stack (expanded)**

* **Next.js 14+ (App Router, TypeScript)**
* **Styling:** Tailwind CSS; component primitives from Radix UI (accessible) if desired.
* **Charts:** `react-chartjs-2` (Chart.js) or `visx` (no SSR headaches).
* **Auth:** Auth.js (NextAuth) Google/GitHub, email domain optional filter.
* **DB:** PostgreSQL 14+
* **ORM:** Prisma
* **Caching:** In‑memory (Node) plus Redis (optional) for rate limits and job deduplication.
* **Background jobs:** Node worker (BullMQ/bee‑queue) running in same Docker compose as API, or simple in‑process job if single-node.
* **Observability:** pino logs, request IDs, Sentry for errors.
* **Containerization:** Docker + docker‑compose for app, worker, postgres, redis.
* **Testing:** Vitest/Jest for unit, Playwright/Cypress for E2E.

#### **4.2. Glicko‑2 Rating System Logic (production‑ready detail)**

* **Parameters (configurable in Admin):**

  * Initial rating **1500**, **RD 350**, **volatility 0.06** (your defaults).
  * System constant **τ (tau)** default **0.5** (commonly used).
  * Scale per Glicko‑2 spec: internal calculations on μ/φ (rating/rd in 173.7178 scale).
* **Update cadence:**

  * **Recommended:** Treat each **confirmed match** as a rating period.
  * **Inactivity inflation:** If a player is inactive, inflate RD as time passes. Implement as a scheduled task that, on read or daily, increases φ toward max (e.g., cap RD at 350). (This mimics rating-period gaps.)
* **Singles:** Standard Glicko‑2 pairwise update.
* **Doubles (Team Average Method):**

  * Convert both players’ ratings to μ/φ.
  * **Team μ = average(μ₁, μ₂)**; **Team φ = sqrt((φ₁² + φ₂²))/2** (simple average on σ is a common approximation; keep it consistent).
  * Compute outcome vs. opposing team μ/φ.
  * Resulting **Δμ** is **applied equally** to both teammates; update each player’s φ and volatility via the same Δ but using their own pre‑rating φ and σ.
  * Document this explicitly on `/admin/settings` for transparency.
* **Provisional flag:** Show a “Provisional” badge if RD > 130 or matches < 5.
* **Library:** `glicko2` or `glicko-two` npm packages, wrapped in your own module so you can swap or test easily.
* **Recomputation:** Deterministic engine that replays matches in **chronological order (playedAt asc, then createdAt)**. See recompute section below.

#### **4.3. Data Models (revised Prisma)**

Below expands your schema for confirmations, teams, audit, allowlist, seasons, and recompute safety. (Field comments explain choices.)

```prisma
// Enums
enum Role { USER ADMIN }
enum MatchType { SINGLES DOUBLES }
enum Outcome { WIN LOSS } // Table tennis has no draws
enum MatchStatus { PENDING CONFIRMED DISPUTED CANCELLED }
enum ResultType { NORMAL FORFEIT WALKOVER RETIRED } // Optional special results
enum SeasonStatus { ACTIVE ARCHIVED FUTURE }

// Core
model User {
  id               String   @id @default(cuid())
  username         String   @unique
  name             String?
  email            String   @unique
  image            String?
  role             Role     @default(USER)
  active           Boolean  @default(true)
  glickoRating     Float    @default(1500)
  glickoRd         Float    @default(350)
  glickoVolatility Float    @default(0.06)
  lastMatchAt      DateTime?
  createdAt        DateTime @default(now())
  participants     MatchParticipant[]
  ratingHistory    RatingHistory[]
  // Derived/denormalized for speed (update via triggers/jobs)
  wins             Int      @default(0)
  losses           Int      @default(0)
  // Indexes
  @@index([active])
}

model AllowlistEmail {
  id        String   @id @default(cuid())
  email     String   @unique
  note      String?
  addedById String?
  addedBy   User?    @relation(fields: [addedById], references: [id])
  createdAt DateTime @default(now())
}

model Season {
  id        String       @id @default(cuid())
  name      String       @unique
  status    SeasonStatus @default(ACTIVE)
  startDate DateTime
  endDate   DateTime?
  createdAt DateTime     @default(now())
  matches   Match[]
}

model Match {
  id            String       @id @default(cuid())
  seasonId      String?
  season        Season?      @relation(fields: [seasonId], references: [id])
  matchType     MatchType
  status        MatchStatus  @default(PENDING)
  resultType    ResultType   @default(NORMAL)
  playedAt      DateTime     @default(now())
  createdAt     DateTime     @default(now())
  enteredById   String
  enteredBy     User         @relation("enteredBy", fields: [enteredById], references: [id])
  confirmedById String?
  confirmedBy   User?        @relation("confirmedBy", fields: [confirmedById], references: [id])
  confirmedAt   DateTime?
  location      String?
  note          String?
  teams         MatchTeam[]
  games         Game[]
  ratingUpdates RatingHistory[]
  auditLogs     AuditLog[]
  @@index([status, playedAt])
}

model MatchTeam {
  id        String  @id @default(cuid())
  matchId   String
  teamNo    Int     // 1 or 2
  match     Match   @relation(fields: [matchId], references: [id])
  players   MatchParticipant[]
  @@unique([matchId, teamNo])
}

model MatchParticipant {
  id        String  @id @default(cuid())
  matchId   String
  teamId    String
  userId    String
  outcome   Outcome?
  match     Match   @relation(fields: [matchId], references: [id])
  team      MatchTeam @relation(fields: [teamId], references: [id])
  user      User    @relation(fields: [userId], references: [id])
  @@unique([matchId, userId]) // prevent duplicates
}

model Game {
  id        String  @id @default(cuid())
  matchId   String
  gameNo    Int
  team1Score Int
  team2Score Int
  match     Match   @relation(fields: [matchId], references: [id])
  @@unique([matchId, gameNo])
}

model RatingHistory {
  id           String   @id @default(cuid())
  userId       String
  matchId      String
  ratingBefore Float
  ratingAfter  Float
  rdBefore     Float
  rdAfter      Float
  volatilityBefore Float
  volatilityAfter  Float
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id])
  match        Match    @relation(fields: [matchId], references: [id])
  @@index([userId, createdAt])
  @@index([matchId])
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  actor      User?    @relation(fields: [actorId], references: [id])
  entityType String   // "Match" | "User" | "Allowlist" | etc.
  entityId   String
  action     String   // "CREATE" | "UPDATE" | "DELETE" | "CONFIRM" | "DISPUTE" ...
  payload    Json?
  createdAt  DateTime @default(now())
}
```

**Notes on schema changes**

* **Teams + Participants:** Explicit `MatchTeam` groups players and supports doubles cleanly.
* **Game scores:** Store both team scores per game to reconstruct series *and* validate wins.
* **Match status:** Adds confirmation/ dispute lifecycle.
* **AuditLog:** Essential for admin edits.
* **Season:** Enables future seasonality without changing model later.
* **Denormalized wins/losses:** Optional for speed; keep truth in `MatchParticipant` and recompute nightly or via triggers.

#### **4.4. API Design (Next.js Route Handlers, JSON)**

**Auth**

* `GET /api/auth/session` → current user or 401.

**Users**

* `GET /api/users?query=&active=true` → list; includes rating snapshot.
* `GET /api/users/:username` → profile, aggregates, charts data.
* `GET /api/users/:id/h2h/:oppId` → head‑to‑head summary.

**Matches**

* `GET /api/matches?playerId=&type=&status=&from=&to=&cursor=`
* `GET /api/matches/:id`
* `POST /api/matches` *(auth required)*

  ```json
  {
    "matchType": "SINGLES|DOUBLES",
    "playedAt": "2025-09-18T17:30:00Z",
    "format": "BO3|BO5",
    "resultType": "NORMAL|FORFEIT|WALKOVER|RETIRED",
    "team1": ["userIdA", "userIdB?"],
    "team2": ["userIdC", "userIdD?"],
    "games": [{"team1Score": 11, "team2Score": 8}, ...],
    "note": "optional"
  }
  ```

  * *Responses:* 201 with created match (`status=PENDING`).
* `POST /api/matches/:id/confirm` *(participant or admin)*
* `POST /api/matches/:id/dispute` *(participant)* reason optional
* `PUT /api/matches/:id` *(admin)* edit
* `DELETE /api/matches/:id` *(admin)*

**Rankings**

* `GET /api/rankings?scope=active|all&type=singles|doubles|overall`

**Admin**

* `GET/POST/DELETE /api/admin/allowlist`
* `POST /api/admin/recompute`

  ```json
  {"fromPlayedAt":"2025-01-01T00:00:00Z","dryRun":true}
  ```
* `GET /api/admin/audit?entityType=&entityId=`

**Errors**: Problem+JSON style `{ "type": "...", "title": "...", "detail": "...", "status": 422 }`.

#### **4.5. Validation Rules (server‑side with Zod)**

* **Players:** distinct across + within teams; in singles, each team size = 1; in doubles, size = 2.
* **Scores:**

  * Each game: min score ≥ 11 for winner; `abs(s1 - s2) ≥ 2`.
  * Series ends once a team reaches needed wins (2 for Bo3, 3 for Bo5); reject extra games.
  * For special `ResultType` (e.g., WALKOVER), `games` must be empty.
* **Chronology:** `playedAt` cannot be in the future (±10 min skew tolerance).
* **Duplicates:** Reject identical submission within a 5‑minute window (same participants, playedAt, total games) using an idempotency key.

#### **4.6. Rating Engine & Recomputation**

**When to compute**

* On transition **`PENDING → CONFIRMED`**:

  1. Open a DB transaction.
  2. Lock a global “rating write” mutex (e.g., advisory lock) to serialize rating calculations.
  3. Compute deltas for this match **using players’ current canonical values**.
  4. Write `RatingHistory` rows and update `User` ratings/RD/volatility.
  5. Commit transaction.

**Editing/deleting historical matches**

* Because Glicko‑2 is path‑dependent, editing a past match requires **replay**.
* Approach:

  * Mark league **“recomputing”** (feature flag).
  * Reset all players to initial (1500/350/0.06).
  * Reapply matches in chronological order up to now, skipping cancelled/deleted, using final edited data.
  * Write ratings and histories.
* Optimization: If change occurs at time T, you *can* recompute from T forward, but you must include **all** players affected directly or indirectly; simplest correct implementation is league‑wide replay from T (or from season start).

**Inactivity RD inflation**

* Nightly job computes new RD for inactive players to reflect uncertainty:

  * Convert RD to φ, inflate toward cap using elapsed days/periods (document method; consistent with your chosen library).
  * Never exceed max RD (e.g., 350).
  * Do **not** change rating, only RD.

---

### **5. Non‑Functional Requirements (expanded)**

**Security**

* Allowlist‑gated OAuth; server‑side role checks; never trust client role.
* HTTPS everywhere; secure cookies; rotate secrets.
* Rate limits on submissions/confirmations (e.g., 30/min per IP) via Redis token bucket.
* RBAC enforcement on each route; Zod input sanitization; output escaping.
* Comprehensive audit logging for admin actions.
* Content Security Policy (CSP) and `helmet` headers.

**Usability**

* Mobile‑first; big tap targets; optimistic UI on submissions; inline validation messages.
* Accessible components (ARIA labels, keyboard navigation, color contrast).
* Helpful empty states and skeleton loaders.

**Performance**

* Indexes on `(playedAt)`, `(status, playedAt)`, `(userId, createdAt)` for histories, `(active)` for rankings.
* Cursor pagination for `/history`.
* Cache computed aggregates (e.g., leaderboard JSON) for 30–60 seconds.

**Portability**

* Docker Compose file provisioning Postgres + (optional) Redis.
* Single command `docker compose up` to boot app+worker+db.
* Environment via `.env` (DATABASE\_URL, NEXTAUTH\_SECRET, OAuth IDs, REDIS\_URL).

**Reliability & Observability**

* Health checks `GET /api/health` (db + redis).
* Sentry for unhandled errors; pino structured logs with request IDs.

**Backups**

* Nightly pg\_dump to local volume or S3; 14‑day retention.

---

### **6. Future Enhancements (Roadmap, clarified)**

* **Achievements & Badges**: stored in `UserBadge` table with rules engine (cron evaluates).
* **H2H view**: `/compare` page already defined.
* **Tournament mode**: add `Tournament`, `Round`, `Seed`, `Match` linkage; single‑elim and RR.
* **Notifications**: Slack webhook on new matches; optional daily digest of recent results.
* **Doubles partner stats**: materialized view `PartnerStats` (userA, userB, wins, losses).
* **Seasons**: admin can archive a season; new season resets leaderboards (ratings either carry over or reset—configurable).

---

### **7. Implementation Plan & Milestones**

**Milestone 1 — Foundations (auth, allowlist, models, admin basics)**

* Auth.js configured with Google/GitHub; allowlist gate.
* Prisma models migrated; seed admin user + 5 test users.
* Admin panel with Allowlist and Users tabs; create/read operations.
* Health check & logging.

**Milestone 2 — Match CRUD + Confirmation + Validation**

* `/submit` page with singles & doubles forms, validation.
* Match `PENDING → CONFIRMED` flow; participant confirmation UI.
* `/matches/:id` detail page; `/history` basic list.
* Audit log entries for create/confirm/dispute.

**Milestone 3 — Rating Engine + Profiles + Leaderboard**

* Glicko‑2 module with deterministic tests.
* Rating updates on confirmation; write `RatingHistory`.
* `/players/{username}` profile with chart; `/rankings` table with active toggle.
* Inactivity RD inflation job.

**Milestone 4 — Editing & Recomputation**

* Admin edit/delete of matches; recompute UI with dry‑run diff.
* Global replay engine with advisory lock; progress indicator.

**Milestone 5 — Polish & Ops**

* Exports (CSV), filters, H2H quickview.
* Slack notifications.
* Backups + monitoring dashboards.

---

### **8. Testing Strategy**

**Unit tests**

* Glicko‑2 math: known fixtures, doubles averaging rules, RD inflation edge cases.
* Validators: score validity, format end conditions, doubles player composition.
* API contracts (Zod schemas).

**Integration tests**

* Full flow: submit → confirm → rating deltas appear; edit historical match → recompute → consistent results.
* AuthZ: non‑admin cannot edit/delete; allowlist enforced.

**E2E tests (Playwright)**

* Mobile viewport submission; instantaneous leaderboard updates; dispute flow; leaderboard sorting and filters; profile chart rendering.

**Performance**

* Seed \~10k matches; measure `/history` and `/rankings` latency (<300ms p95 with warm cache).

---

### **9. UX Details & Components**

* **Form inputs**: Player selects display rating inline (“Alice (1523)”).
* **Preview card** before submit: shows series winner and per‑game breakdown.
* **Delta chips**: +12 / −8 next to each confirmed match.
* **Badges**: Provisional, Streak X, Giant Slayer (roadmap).
* **Empty states**: “No matches yet—submit your first!” with CTA.
* **Dark mode**: Tailwind `dark:` classes; system preference default.

---

### **10. Security & Compliance Notes**

* Store minimal PII (name, email, avatar).
* Hide emails from non‑admins.
* Right to delete account: mark inactive; keep results for league integrity (pseudonymize display name if requested).
* Rotate OAuth secrets; enforce least privilege on hosting.

---

### **11. Operational Runbook (concise)**

* **Recompute run:**

  1. Announce read‑only window (optional).
  2. Trigger `/api/admin/recompute?from=T`.
  3. Monitor logs; on completion, verify top 10 players vs. expected snapshot.
* **Backup restore:**

  * Use matching app image version; restore DB; re‑run migrations if needed.
* **Incident:**

  * Roll back to latest backup; replay recent matches from CSV export if necessary.

---

### **12. Nice‑to‑Have Engineering Touches**

* Use **advisory locks** (`pg_advisory_xact_lock`) around rating writes and recompute.
* Store a **deterministic hash** of each match payload; show it on match detail for audit friendliness.
* Add a small **“confidence band”** on rating charts based on RD.
* **Materialized views** (or cached tables) for leaderboard and partner stats; refresh on schedule or on write.

---

## Quick Answers to Likely Questions

* **Why auto-confirm on submission?** Keeps standings live while relying on admins to correct any erroneous entries using the dispute tools.
* **How do we handle editing old matches?** Use the replay engine; it’s the simplest correct approach for Glicko‑2.
* **Do doubles distort ratings?** Team averaging is simple and consistent; by documenting the exact μ/φ averaging rule, you’ll keep the system predictable.

---

If you want, I can follow up with:

* A minimal **Glicko‑2 wrapper** in TypeScript with doubles support and tests.
* A **Prisma migration** file and **seed script** for five demo players plus sample matches.
* Zod schemas for the `/api/matches` endpoints and a few Playwright test skeletons.
