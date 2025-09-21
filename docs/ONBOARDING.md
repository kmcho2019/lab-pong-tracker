# Admin Onboarding & Batch User Import

This guide walks a new club lead through turning on the Lab Pong Tracker for the first time or migrating from a legacy spreadsheet.

## 1. Prerequisites

1. Clone the repository and copy `.env.example` to `.env`, filling in Postgres and Auth provider secrets.
2. Start the database: `docker compose up -d db`.
3. Apply schema: `npx prisma migrate deploy`.
4. (Optional) Seed demo data: `npm run db:seed`.
5. Start the web app: `npm run dev` (development) or `docker compose up web` (production image).

## 2. Create the First Admin Account

Use the batch user endpoint to seed yourself and any initial members. Send the request once your session cookie is available (sign in with OAuth if your email is already on the allowlist, or temporarily add it to `EMAIL_ALLOWLIST`).

```bash
curl -X POST http://localhost:3000/api/admin/users/batch \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "onDuplicate": "skip",
    "users": [
      {
        "displayName": "Alex Admin",
        "email": "alex@example.com",
        "role": "ADMIN",
        "initialRating": 1650,
        "initialRd": 120
      },
      {
        "displayName": "Lee Hyun",
        "email": "hyun@example.com",
        "initialSinglesRating": 1800,
        "initialSinglesRd": 80,
        "initialDoublesRating": 1750
      }
    ]
  }'
```

### Rating seeds

- If you provide an initial rating (overall or singles/doubles), the system assumes the player is well calibrated and automatically lowers the RD (default 100) and volatility (default 0.04).
- Omit the rating fields to use the standard defaults (1500 rating, 350 RD, 0.06 volatility).
- Supply `active: false` to stage players who have not joined yet.

The endpoint responds with counts of created, updated, and skipped users. Repeat the call as needed; set `"onDuplicate": "update"` to refresh ratings for existing emails.

## 3. Verify Access

1. Navigate to `/admin`.
2. Confirm the **Allowlist**, **Member Lifecycle**, **Match Management**, and **Tournament Manager** sections load.
3. Use the **Allowlist** panel to invite additional members (or automate via the batch endpoint).
4. Use **Member Lifecycle** to promote a co-admin immediately so there is always a backup.
5. Duplicate display names are disambiguated automatically in the UI (`Alex Kim (@alex)`), so you can reuse existing nicknames without confusion.

## 4. Optional: Import Historical Results

1. Batch add all legacy players with their final-season ratings.
2. Enter historical matches from oldest to newest using the match manager or a script against `/api/admin/matches/:id`.
3. Run `POST /api/admin/recompute` when finished to ensure the rating history is deterministic.

## 5. Next Steps

- Share the `/submit` link and confirm the submit form recognises the seeded players.
- Visit `/players` to verify ratings and `/tournaments` to double-check filters.
- Update the README and docs links for your club wiki so future admins know where to start.
- Document the hand-off plan (see **Admin Transitions** in `docs/ADMIN_GUIDE.md`).

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common setup issues.
