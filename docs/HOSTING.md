# Hosting & Deployment Playbook

This document outlines how to deploy the Lab Pong Tracker in common environments.

## 1. Prerequisites

- Node.js 18+
- PostgreSQL 15 (or managed alternative)
- OAuth credentials (Google and/or GitHub)
- Persistent storage for the database (volume, managed service, etc.)

## 2. Environment Variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:password@host:5432/lab_pong?schema=public`). |
| `NEXTAUTH_URL` | Public URL of the deployed app (`https://pong.example.com`). |
| `NEXTAUTH_SECRET` | 32+ character secret (`openssl rand -base64 32`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth credentials. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Optional GitHub OAuth. |
| `EMAIL_ALLOWLIST` | Comma-separated list of emails bootstraped into allowlist. |

## 3. Vercel Deployment

1. Fork/clone repo and push to GitHub.
2. Create Vercel project; select the repo.
3. Configure Environment Variables in Vercel dashboard (Production + Preview).
4. For Postgres, either:
   - Use Neon/Supabase + set `DATABASE_URL`, or
   - Expose managed Postgres connection string.
5. Add `npm run prisma:migrate` to Vercel “Build Command” via [Managed Postgres with Prisma](https://vercel.com/docs/storage/sql/prisma).
6. Vercel installs dependencies, runs migrations, builds the app, and hosts at your chosen domain.

> Vercel serverless functions require connection pooling; consider Prisma Accelerate or pgBouncer in production.

## 4. Docker Compose (Self-hosted)

1. Ensure `.env` is filled out.
2. Build the image:
   ```bash
   docker compose build web
   ```
3. Start services:
   ```bash
   docker compose up -d
   ```
4. Apply migrations inside the container:
   ```bash
   docker compose exec web npm run prisma:migrate
   docker compose exec web npm run db:seed # optional demo data
   ```

The app is exposed on port 3000; set up a reverse proxy (Caddy, Nginx, Traefik) with HTTPS.

## 5. Fly.io

1. Install `flyctl`, run `fly launch` to create app.
2. Provision Fly Postgres (`fly pg create`).
3. Set secrets:
   ```bash
   fly secrets set DATABASE_URL=... NEXTAUTH_SECRET=... GOOGLE_CLIENT_ID=...
   ```
4. Deploy: `fly deploy`.
5. Run migrations: `fly ssh console -C "cd /app && npm run prisma:migrate"`.

## 6. Production Checklist

- [ ] All migrations applied (`npx prisma migrate status`).
- [ ] `NEXTAUTH_URL` matches deployed domain.
- [ ] OAuth redirect URIs configured for production domain.
- [ ] Admin account seeded (update `User.role = 'ADMIN'`).
- [ ] Allowlist populated.
- [ ] Background job or cron configured for periodic recomputes if needed.
- [ ] Backups scheduled (`pg_dump` or managed service snapshots).

## 7. Zero-downtime Tips

- Use migrations in migrate deploy mode (already default).
- Run recompute on a canary environment before production edits.
- Consider read replicas for analytics workloads.

Refer back to `docs/ADMIN_GUIDE.md` for ongoing maintenance and incident response.
