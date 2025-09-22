# Admin & Database Operations Guide

This guide expands on the README with the day‑to‑day tasks admins will perform, plus the database management steps needed to keep the lab pong tracker healthy.

## 0. Quick Start

- Follow [ONBOARDING.md](./ONBOARDING.md) to seed your first admin account and batch import players.
- Keep [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) handy for common setup problems.

## 1. Access Control & Allowlist

1. Sign in with an existing admin account (role `ADMIN`).
2. Navigate to `/admin`.
3. Use **Allowlist manager** to add emails:
   - Enter the lab member’s email and optional note.
   - Click “Add to allowlist”.
   - The email appears in the table with timestamp.
4. To revoke access, either delete the allowlist entry or set the player’s `active` flag to `false` (see member lifecycle below).

> Allowlist writes are logged in `AuditLog` (message `ALLOWLIST_ADDED` if you extend the API).

### 1.1 Member Lifecycle & Admin Handover

- **Promote a successor** via the **Member Lifecycle** grid. Click “Promote to admin” and confirm the new admin can reach `/admin`.
- **Demote or freeze** the outgoing admin once the successor is live. The platform prevents removing the final active admin—promote someone else first.
- **Freeze/Reactivate** keeps rating history intact while removing access. Use it for alumni or sabbaticals.
- **API alternative**: `PATCH /api/admin/users/:id` with `{ "role": "ADMIN" }` or `{ "active": false }` mirrors the UI actions.
- **Edit display name / handle**: Click “Edit name” to adjust the member’s display name or `@handle`. Handles must be 3–32 lowercase characters (letters, digits, hyphen, underscore). Leave the handle blank to auto-generate a new slug from the display name.
- **Checklist**: Always keep at least two active admins to avoid lockouts when people leave the lab.

## 2. Match Moderation

- **Match manager UI**: `/admin` → “Match Management” collapses by default. Expand the section to edit scores, update participants, or cancel a match. Saving a change automatically triggers a rating recompute.
- **Confirm**: Players confirm via `/api/matches/:id/confirm`. Admins can call the same endpoint (requires session cookie) to force-confirm if a player is unavailable.
- **Dispute**: POST to `/api/matches/:id/dispute` with a reason string. Status changes to `DISPUTED`; rating updates are *not* rolled back automatically, so follow with recompute.
- **API**: For scripted edits, use `PATCH /api/admin/matches/:id` with the same payload the match manager sends (scores, participants, target points, etc.).

## 3. Tournament Management

- In `/admin` the **Tournament Manager** lets you choose between the classic **Standard** format and the new **Competitive monthly** option. Standard mode keeps the per-player or total-games quotas; competitive mode locks brackets to round-robin play and exposes a field for the number of iterations.
- Competitive monthly events automatically cluster players by overall rating, fix doubles pairings to minimise average rating divergence, and generate full round-robin schedules. Iteration numbers are shown on every matchup; they remain read-only when editing to protect schedule balance.
- Both the admin dashboard and the public tournament page now show per-group standings (wins, losses, points for/against, differential, rank). Use this view to announce podium finishers as soon as the final results are in.
- Player lists inside each group display the relevant singles/doubles rating so participants can gauge the strength of their opposition at a glance.

## 4. Ratings Recompute

Use when editing historical data or importing new matches.

- On `/admin` use the **Run recompute** button (Member Lifecycle section). Read the warning—replay recomputes every confirmed match and can take several seconds.
- Optional API call: `POST /api/admin/recompute` with body `{ "from": "2025-01-01T00:00:00.000Z" }` to replay from a specific date.
- The routine resets `User` ratings/RD/volatility`, truncates `RatingHistory`, clears cached deltas, and replays confirmed matches chronologically. Avoid running during peak usage.

## 5. Database Lifecycle

### Start Services

```bash
docker compose up -d db
```

### Migrations

```bash
npx prisma migrate deploy
```

### Seed Demo Data

```bash
npm run db:seed
```

Seeds the allowlist (from `EMAIL_ALLOWLIST`), four demo users, eight matches, and runs a recompute to populate rating history.

> Ensure `.env` is present before running seeds; the script loads environment variables via `dotenv`.

### Reset Database

```bash
docker compose down -v   # drops db volume
rm -rf prisma/migrations
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0001_init/migration.sql
npx prisma migrate deploy
npm run db:seed
```

Alternatively, connect with `psql` and issue `TRUNCATE` statements (`Match`, `MatchParticipant`, `MatchTeam`, `RatingHistory`, `AuditLog`, `User`, etc.).

## 6. Backups & Maintenance

- **Backups**: For Docker Postgres, use `pg_dump`:
  ```bash
  docker compose exec db pg_dump -U user -d lab_pong > backup.sql
  ```
- **Restore**:
  ```bash
  cat backup.sql | docker compose exec -T db psql -U user -d lab_pong
  ```
- **Monitoring**: Tail the container logs `docker compose logs -f db` and the Next.js process (`npm run dev` or `npm run start`).

## 7. Promotion Checklist

1. Confirm migrations have been applied (`npx prisma migrate status`).
2. Run tests (`npm run lint`, `npm run test`, optional `npm run build`).
3. Re-seed staging with `npm run db:seed` if desired.
4. Deploy with Docker (`docker build -t lab-pong .` then `docker run --env-file .env -p 3000:3000 lab-pong`).
5. Verify admin UI and leaderboard data after deploy.

## 8. Troubleshooting Tips

| Symptom | Fix |
| ------- | --- |
| `auth` “is not a function” errors | Ensure you’re importing `auth` from `src/server/auth` (uses `getServerSession`). |
| Prisma “Environment variable not found: DATABASE_URL” | Confirm `.env` exists or export `DATABASE_URL` in shell; seeding script loads `.env` at runtime. |
| Ratings look wrong after edits | Hit `/api/admin/recompute` to replay matches. |
| OAuth redirect mismatch | Update `NEXTAUTH_URL` and provider callback URLs to match the domain. |

This guide should give admins and operators the concrete steps they need to manage league data responsibly.
