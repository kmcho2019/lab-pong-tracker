# Agent Spec — Lab Table Tennis League

**Version:** 1.0  
**Date:** 2025‑09‑18  
**Owners:** Web Team  
**Scope:** Frontend (Next.js), API (Next.js route handlers), DB (Prisma/Postgres), Rating Worker  

---

## 0) Purpose
This document instructs an implementation agent (you) how to build and operate the Lab Table Tennis League with the following **tweaks**:

1. **Single‑game matches** only. Each submission records exactly one game (e.g., first to 11 with deuce or custom target). No best‑of series.  
2. **Korean‑friendly player names** and search/sort (full Unicode support, Hangul collation).  
3. **Fast entry UI**: dropdown/combobox to choose players (singles or doubles) and enter scores quickly on mobile.

The rest of the system (Glicko‑2, history, profiles, rankings, admin, recompute) remains as previously specified.

---

## 1) High‑Level Flow

1. **Auth & Allowlist** → user can access `/submit`.
2. **Submit a game** (Singles or Doubles): select players via searchable dropdowns; enter `team1Score`, `team2Score`; optional target and win‑by margin (defaults 11 & 2).  
3. Server validates payload, creates `Match(status=PENDING)` with a single game score (no child `Game` rows).  
4. **Confirmation**: any opponent confirms → `CONFIRMED`.  
5. **Rating update**: Glicko‑2 updates run on confirmation.  
6. Users see updates on **Leaderboard**, **Profile**, and **History**.

---

## 2) Data Model (Prisma) — single‑game simplification

**Key change:** a `Match` now stores **one game’s** scores directly. The `Game` table is removed. Teams/participants stay.

```prisma
enum Role { USER ADMIN }
enum MatchType { SINGLES DOUBLES }
enum Outcome { WIN LOSS }
enum MatchStatus { PENDING CONFIRMED DISPUTED CANCELLED }
enum ResultType { NORMAL FORFEIT WALKOVER RETIRED }

enum SeasonStatus { ACTIVE ARCHIVED FUTURE }

model User {
  id               String   @id @default(cuid())
  username         String   @unique // ASCII slug; see i18n rules
  displayName      String   // Unicode, supports Korean
  email            String   @unique
  image            String?
  role             Role     @default(USER)
  active           Boolean  @default(true)
  glickoRating     Float    @default(1500)
  glickoRd         Float    @default(350)
  glickoVolatility Float    @default(0.06)
  lastMatchAt      DateTime?
  wins             Int      @default(0)
  losses           Int      @default(0)
  createdAt        DateTime @default(now())
  participants     MatchParticipant[]
  ratingHistory    RatingHistory[]

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
  // Single‑game fields (no Game table)
  team1Score    Int          @default(0)
  team2Score    Int          @default(0)
  targetPoints  Int          @default(11) // e.g., 11, 15, 21
  winByMargin   Int          @default(2)  // usually 2

  playedAt      DateTime     @default(now())
  createdAt     DateTime     @default(now())
  location      String?
  note          String?

  enteredById   String
  enteredBy     User         @relation("enteredBy", fields: [enteredById], references: [id])
  confirmedById String?
  confirmedBy   User?        @relation("confirmedBy", fields: [confirmedById], references: [id])
  confirmedAt   DateTime?

  // Relations
  teams         MatchTeam[]
  participants  MatchParticipant[]
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
  @@unique([matchId, userId])
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
  entityType String   // "Match" | "User" | "Allowlist" | ...
  entityId   String
  action     String   // CREATE | UPDATE | DELETE | CONFIRM | DISPUTE
  payload    Json?
  createdAt  DateTime @default(now())
}
```

**Migration note:** If upgrading from the Bo3/Bo5 schema, migrate by copying series‑decider game into `team1Score/team2Score` and flattening. Old `Game` rows can be archived.

---

## 3) Internationalization & Korean Support

- **Encoding:** UTF‑8 throughout. Database `UTF8` with `en_US.utf8` or `ko_KR.utf8` locale.  
- **Input normalization:** Normalize `displayName` to **NFC** on write to avoid composed/decomposed Hangul mismatches.  
- **Search:** Use case‑insensitive, accent‑insensitive search with ICU. For Postgres, create an index with `pg_trgm` or `unaccent` (if available) and store a `search_key` column (NFKD, lowercased).  
- **Collation for sort:** Prefer `ko_KR` collation where supported; fallback to client‑side collator: `new Intl.Collator(['ko', 'en'], { sensitivity: 'base' })`.  
- **Slugs:** Keep `displayName` (Unicode) and a separate ASCII `username` slug. Slug generation:
  1. Try transliteration (ICU) from Hangul to Latin;  
  2. Fallback to `uXXXX` hex segments;  
  3. Ensure uniqueness with numeric suffix.  
- **Examples:** `displayName="김철수"` → `username="gim-cheolsu"`; `displayName="홍길동"` → `username="hong-gildong"`.

---

## 4) Validation Rules (single‑game)

- **Teams & players**  
  - Singles: each team size = 1; Doubles: each team size = 2.  
  - All user IDs must be distinct.  
  - Submitter must be one of the participants (unless admin).

- **Scores**  
  - `targetPoints` default **11** (configurable 7–21).  
  - `winByMargin` default **2** (configurable 1–5).  
  - Exactly one team must win:  
    - `max(team1Score, team2Score) >= targetPoints`  
    - `abs(team1Score - team2Score) >= winByMargin`  
  - No negative scores; both integers.  
  - For `ResultType` in {WALKOVER, FORFEIT, RETIRED}, set both scores to `0` and store outcome on participants.

- **Chronology & duplicates**  
  - `playedAt` not in future (±10m skew).  
  - Reject duplicate within 5 minutes (same participants, same scores, same `playedAt` minute). Use a hashed idempotency key.

---

## 5) API Contracts (JSON)

### POST `/api/matches`
```json
{
  "matchType": "SINGLES|DOUBLES",
  "playedAt": "2025-09-18T08:30:00Z",
  "resultType": "NORMAL|FORFEIT|WALKOVER|RETIRED",
  "targetPoints": 11,
  "winByMargin": 2,
  "team1": ["userIdA", "userIdB?"],
  "team2": ["userIdC", "userIdD?"],
  "team1Score": 11,
  "team2Score": 7,
  "note": "optional"
}
```
- **Response 201:** `{ matchId, status: "PENDING" }`

### POST `/api/matches/:id/confirm`
- Body optional `{ "accept": true }` → transitions to `CONFIRMED` if caller is on opposing side (or any participant in relaxed mode).

### POST `/api/matches/:id/dispute`
- Body `{ "reason": "string" }` → `DISPUTED` status.

### GET `/api/rankings?type=singles|doubles|overall&scope=active|all`
- Returns list with rating, RD, wins, losses, lastMatchAt; collation aware for display names.

### GET `/api/users/:username`
- Profile aggregates, rating history points, recent games (single‑game records).

---

## 6) Rating Engine — single‑game integration

- **Trigger:** on `CONFIRMED`.  
- **Singles:** standard Glicko‑2 between two players.  
- **Doubles:** team average method (μ avg; φ via sqrt(mean of variances)/2). Apply equal Δ to teammates; update each player’s RD/volatility independently.  
- **Inactivity:** nightly RD inflation toward cap (e.g., 350).  
- **Recompute:** When editing/deleting historical games, replay from the earliest affected `playedAt` (simplest: league‑wide replay from date T).  
- **Audit:** write `RatingHistory` rows per participant.

---

## 7) Submit UI (mobile‑first, fast entry)

- **Form pattern:** Tabs for **Singles** and **Doubles**.  
- **Player selectors:** Accessible **combobox** components with search; show avatar + `displayName` (Unicode) + current rating; prevent duplicates; keyboard and touch friendly.  
- **Score inputs:** Two numeric steppers or segmented control; live validation messages (“winning side must lead by ≥ 2”).  
- **Advanced section (collapsed):** target points, win‑by margin, location, note.  
- **Summary banner:** shows inferred winner and final score (e.g., `김철수/이영희 11 — 8 박민수/최지우`).  
- **Submit CTA:** optimistic UI, then redirect to `/matches/:id`.

**Accessibility & i18n**  
- Use `lang="ko"` where appropriate for screen readers; `Intl.Collator(['ko','en'])` for local sorts; input placeholders localized if you add i18n later.

---

## 8) Leaderboard & Profile (single‑game semantics)

- **Leaderboard** shows ratings based on cumulative single‑game history. Filters for Singles/Doubles/Overall remain.  
- **Profile**: rating line chart, win/loss totals count games (not series). Add optional “Games/Day” and “Form (last 10 games)” tiles.

---

## 9) Admin & Moderation

- Allowlist CSV import; toggle relaxed vs. strict confirmation.  
- Edit game: change scores, participants, date → triggers recompute dry‑run + apply.  
- Delete game: soft‑delete (status `CANCELLED`) → recompute.  
- Audit log for all actions.

---

## 10) Security & Ops

- Auth.js OAuth; allowlist enforced server‑side.  
- Rate limit submissions/confirmations.  
- Advisory lock around rating writes/recompute.  
- Backups nightly; Sentry/pino logs; health check endpoint.  
- Docker compose with Postgres and (optional) Redis.

---

## 11) Testing Checklist

- **Unicode:** create users `김철수`, `홍길동`, mix Hangul + Latin; ensure search, sort, selection, and slug creation all pass.  
- **Validation:** win‑by‑2, custom targets (e.g., 15, 21), doubles duplicate prevention, future timestamps reject.  
- **Rating math:** fixtures for singles and doubles; equal Δ application; RD inflation after inactivity.  
- **Recompute:** edit old game and verify downstream ratings change deterministically.  
- **E2E:** mobile submit flow; pending confirmation → confirm → leaderboard update.

---

## 12) Rollout Steps

1. Apply Prisma migration (drop `Game`, add single‑game fields).  
2. Seed a few Korean and English display names.  
3. Ship submit form with combobox & validation.  
4. Enable confirmation + rating engine; test dry‑run recompute.  
5. Announce to lab with quickstart: “Submit each game right after you play.”

---

## 13) Open Questions (track & resolve)

- Do we expose custom targets and win‑by margin to all users or restrict to admins?  
- Should WALKOVER/RETIRED count toward ratings or be excluded? (default: **excluded** from rating, but recorded.)  
- Season boundaries: carry over ratings or reset? (default: **carry over**.)

---

## 14) Reference Snippets

**Client score rule (pseudo‑TS):**
```ts
function isValidScore(a: number, b: number, target = 11, winBy = 2) {
  const max = Math.max(a, b), min = Math.min(a, b);
  if (max < target) return false;
  if (max - min < winBy) return false; // deuce handled implicitly
  return true;
}
```

**Intl collator for mixed KO/EN names:**
```ts
export const nameCollator = new Intl.Collator(['ko', 'en'], { sensitivity: 'base' });
list.sort((u1, u2) => nameCollator.compare(u1.displayName, u2.displayName));
```

**Slug generation (fallbacks):**
```ts
import { transliterate as tr } from 'transliteration';
export function toSlug(displayName: string) {
  const base = tr(displayName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'u' + [...displayName].map(c => c.codePointAt(0)?.toString(16)).join('');
}
```

