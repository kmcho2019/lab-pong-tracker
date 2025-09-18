# Database Operations Guide

This guide explains how to connect to the PostgreSQL database, inspect data, perform common management tasks, and handle backups/restores.

## 1. Connecting to the Database

### 1.1 From Docker Compose

If you are using the bundled Docker service (`docker compose up -d db`):

- Host: `localhost`
- Port: `5432`
- Database: `lab_pong`
- Username: `user`
- Password: `password`

### 1.2 Using `psql`

```bash
# Open an interactive shell
psql postgresql://user:password@localhost:5432/lab_pong
```

Within `psql`, list tables:

```sql
\dt
```

Sample query to view users:

```sql
SELECT id, displayName, email, role, glickoRating FROM "User" ORDER BY displayName;
```

### 1.3 GUI Tools

You can connect with any PostgreSQL GUI (TablePlus, PgAdmin, DBeaver) using the same connection details.

## 2. Inspecting and Manipulating Data

### 2.1 Allowlist Entries

```sql
SELECT email, note, createdAt FROM "AllowlistEmail" ORDER BY createdAt DESC;
```

Insert new entry (alternative to admin UI):

```sql
INSERT INTO "AllowlistEmail" (id, email, note)
VALUES (gen_random_uuid(), 'player@example.com', 'Invited 2025-09-18');
```

### 2.2 Promoting an Admin

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'admin@example.com';
```

### 2.3 Fixing a Match Result

```sql
UPDATE "Match"
SET team1Score = 12, team2Score = 10, note = 'Corrected result'
WHERE id = 'match-id-here';
```

Always follow edits with a recompute (`/api/admin/recompute`).

### 2.4 Removing a Match

```sql
UPDATE "Match" SET status = 'CANCELLED', cancelledAt = NOW() WHERE id = 'match-id';
```

Optionally delete the row entirely:

```sql
DELETE FROM "Match" WHERE id = 'match-id';
DELETE FROM "MatchParticipant" WHERE matchId = 'match-id';
DELETE FROM "MatchTeam" WHERE matchId = 'match-id';
```

Run recompute afterwards.

## 3. Backups and Restores

### 3.1 Backups with `pg_dump`

```bash
docker compose exec db pg_dump -U user -d lab_pong > backup.sql
```

### 3.2 Restores with `psql`

```bash
cat backup.sql | docker compose exec -T db psql -U user -d lab_pong
```

### 3.3 Scheduled Backups

Use cron to run `pg_dump` daily:

```
0 2 * * * docker compose exec db pg_dump -U user -d lab_pong > /backups/lab_pong-$(date +\%F).sql
```

## 4. Database Reset

```bash
docker compose down -v
rm -rf prisma/migrations
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0001_init/migration.sql
npx prisma migrate deploy
npm run db:seed
```

## 5. Performance & Diagnostics

- Check active connections: `SELECT * FROM pg_stat_activity;`
- Analyze table sizes: `SELECT relname, pg_total_relation_size(relid) FROM pg_catalog.pg_statio_user_tables ORDER BY 2 DESC;`
- Vacuum (with caution): `VACUUM ANALYZE;`

## 6. Troubleshooting Checklist

| Symptom | Resolution |
| --- | --- |
| `prisma` connection errors | Ensure docker service is running and `.env` has correct `DATABASE_URL`. |
| Migrations missing | `npx prisma migrate status`, re-run `npx prisma migrate deploy`. |
| Unable to connect via psql | Confirm host/port credentials, check firewall, ensure postgres container is up (`docker compose ps`). |

Keep this guide alongside `docs/ADMIN_GUIDE.md` for a complete operational playbook.
