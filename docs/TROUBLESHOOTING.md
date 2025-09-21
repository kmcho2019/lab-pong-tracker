# Troubleshooting Checklist

Common pitfalls and the quickest fixes when bringing the league online.

## Authentication

- **Login loop after OAuth** – Confirm `NEXTAUTH_URL` matches the browser origin and provider callback URLs. Restart the app after editing `.env`.
- **Admin cannot reach `/admin`** – Ensure their email is in the allowlist *and* their user role is `ADMIN`. Use the batch user endpoint with `"onDuplicate": "update"` to promote them.

## Database & Migrations

- **`P3009` migration failures** – The migration runner now auto-heals failed states, but if the database still refuses a migration, run `npx prisma migrate resolve --rolled-back <migration>` followed by `npx prisma migrate deploy`.
- **`DATABASE_URL` missing** – Make sure `.env` exists in the project root before running Prisma commands or scripts.

## Ratings & Matches

- **Ratings look wrong after manual edits** – Re-run `POST /api/admin/recompute` to replay confirmed matches from scratch.
- **Imported players show 350 RD despite seeded rating** – Include `initialRd` (or the more specific `initialSinglesRd`/`initialDoublesRd`) when batch-adding players so the system applies the trusted RD/volatility.

## UI & Admin Console

- **Match manager not showing latest games** – Refresh the page or click the “Show matches” button; the section collapses by default when there are many entries.
- **Tournament list empty** – Ensure you have run migrations and seeded or created tournaments. Collapsed sections show a helper message prompting you to expand.

## Dev & Docker

- **`tsx` cannot find modules during `npm run start`** – The Dockerfile now copies `src` and `tsconfig.json` into the runtime image. Rebuild with `docker compose build web` if the container was created before that change.
- **Slow local startup** – Use `docker compose up db` before `npm run dev` so Prisma can connect instantly.

Still stuck? Gather the server logs (`docker compose logs web`) and open an issue with the stack trace and the exact command you ran.
