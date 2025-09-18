# Admin & Database Operations Guide

This guide expands on the README with the day‑to‑day tasks admins will perform, plus the database management steps needed to keep the lab pong tracker healthy.

## 1. Access Control & Allowlist

1. Sign in with an existing admin account (role `ADMIN`).
2. Navigate to `/admin`.
3. Use **Allowlist manager** to add emails:
   - Enter the lab member’s email and optional note.
   - Click “Add to allowlist”.
   - The email appears in the table with timestamp.
4. To revoke access, remove the address via psql or add a CLI helper (planned). For now, set `active = false` on the corresponding `User` row.

> Allowlist writes are logged in `AuditLog` (message `ALLOWLIST_ADDED` if you extend the API).

## 2. Match Moderation

- **Confirm**: Players confirm via `/api/matches/:id/confirm` or future UI. Admins can call the same endpoint (requires session cookie) to force-confirm.
- **Dispute**: POST to `/api/matches/:id/dispute` with a reason string. Status changes to `DISPUTED`; rating updates are *not* rolled back automatically, so follow with recompute.
- **Cancel/Edit**: Not yet implemented; advisable path is to dispute, adjust the DB row, then run a recompute (see below).

## 3. Ratings Recompute

Use when editing historical data or importing new matches.

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  http://localhost:3000/api/admin/recompute
```

- Optional body `{ "from": "2025-01-01T00:00:00.000Z" }` replays from a specific date.
- The routine resets `User` ratings/RD/volatility, truncates `RatingHistory`, clears cached deltas, and replays confirmed matches chronologically.

## 4. Database Lifecycle

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

## 5. Backups & Maintenance

- **Backups**: For Docker Postgres, use `pg_dump`:
  ```bash
  docker compose exec db pg_dump -U user -d lab_pong > backup.sql
  ```
- **Restore**:
  ```bash
  cat backup.sql | docker compose exec -T db psql -U user -d lab_pong
  ```
- **Monitoring**: Tail the container logs `docker compose logs -f db` and the Next.js process (`npm run dev` or `npm run start`).

## 6. Promotion Checklist

1. Confirm migrations have been applied (`npx prisma migrate status`).
2. Run tests (`npm run lint`, `npm run test`, optional `npm run build`).
3. Re-seed staging with `npm run db:seed` if desired.
4. Deploy with Docker (`docker build -t lab-pong .` then `docker run --env-file .env -p 3000:3000 lab-pong`).
5. Verify admin UI and leaderboard data after deploy.

## 7. Troubleshooting Tips

| Symptom | Fix |
| ------- | --- |
| `auth` “is not a function” errors | Ensure you’re importing `auth` from `src/server/auth` (uses `getServerSession`). |
| Prisma “Environment variable not found: DATABASE_URL” | Confirm `.env` exists or export `DATABASE_URL` in shell; seeding script loads `.env` at runtime. |
| Ratings look wrong after edits | Hit `/api/admin/recompute` to replay matches. |
| OAuth redirect mismatch | Update `NEXTAUTH_URL` and provider callback URLs to match the domain. |

This guide should give admins and operators the concrete steps they need to manage league data responsibly.
