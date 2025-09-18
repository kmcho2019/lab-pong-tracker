# Local Docker Guide (WSL2 + Windows 11)

This walkthrough assumes you are running Windows 11 with WSL2 (Ubuntu) and Docker Desktop installed. It covers cloning the project, configuring environment variables, starting the stack, promoting yourself to admin, and entering your first matches through the API.

## 1. Prerequisites

1. **Docker Desktop** installed with WSL2 integration enabled (Settings → Resources → WSL Integration → enable for Ubuntu).
2. **Ubuntu (WSL2)** shell (`wsl.exe`).
3. **Node/npm** (for running seeds/tests outside the container) – optional but recommended.
4. **Git** for cloning the repository.

## 2. Clone the Repository

```bash
cd ~/TableTennisWebDev
git clone https://github.com/your-org/lab-pong-tracker.git
cd lab-pong-tracker
```

> Replace the repository URL with your fork if applicable.

## 3. Create `.env`

Copy the template and edit values:

```bash
cp .env.example .env
nano .env
```

Suggested development values:

```
DATABASE_URL=postgresql://user:password@db:5432/lab_pong?schema=public
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-a-32-char-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
EMAIL_ALLOWLIST=your.email@example.com
```

- Keep the database hostname as `db`; Docker Compose creates that service name.
- Add any colleagues’ emails to `EMAIL_ALLOWLIST` (comma-separated). They can be edited later via the admin UI.

## 4. Start the Stack

```bash
docker compose up -d db
```

This pulls the Postgres image and launches the database container. Check status:

```bash
docker compose ps
```

Once Postgres is up, apply the schema and seed demo data **from the host** (WSL shell):

```bash
npm install
npx prisma migrate deploy
npm run db:seed
```

Alternatively, run seeds inside the Docker container:

```bash
docker compose run --rm web npm run prisma:migrate
docker compose run --rm web npm run db:seed
```

## 5. Run the Web App in Docker

To build the production image and start the web container:

```bash
docker compose build web
NEXTAUTH_SECRET=$(openssl rand -base64 32) docker compose up -d web
```

The app is exposed on `http://localhost:3000`. Docker Desktop forwards Windows <→ WSL automatically. Visit the URL in a browser on Windows.

> Ensure `NEXTAUTH_URL` in `.env` matches `http://localhost:3000` during local testing.

## 6. Promote Yourself to Admin

The admin role lives in the `User` table. After signing in once (see §8), update your row:

```bash
docker compose exec db psql -U user -d lab_pong -c "UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'your.email@example.com';"
```

Alternatively, run the same command via `psql` on the host if you prefer.

## 7. Managing the Allowlist

From the admin account, visit `http://localhost:3000/admin` and add/remove emails through the UI. Under the hood it writes to the `AllowlistEmail` table.

CLI option (inside WSL):

```bash
docker compose exec db psql -U user -d lab_pong -c "INSERT INTO \"AllowlistEmail\" (id, email) VALUES (gen_random_uuid(), 'friend@example.com');"
```

## 8. Signing In

1. Open `http://localhost:3000` and click **Sign in**.
2. Choose Google or GitHub (make sure the same email is in the allowlist).
3. The first successful sign-in creates a `User` row automatically.

> If you don’t want to configure OAuth yet, temporarily disable auth by editing `middleware.ts` (remove protected routes) and revert after testing.

## 9. Submitting Matches (API)

When you’re the submitter:

```bash
MATCH_ID=$(curl -s -X POST http://localhost:3000/api/matches \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_COOKIE" \
  -d '{
    "matchType": "SINGLES",
    "team1": ["player-one-id"],
    "team2": ["player-two-id"],
    "team1Score": 11,
    "team2Score": 7
  }' | jq -r '.match.id')
```

- Replace `YOUR_SESSION_COOKIE` with the cookie from your browser (DevTools → Application → Cookies → `next-auth.session-token`).
- Player IDs can be obtained via `GET /api/users` or from the database (`SELECT id, displayName FROM "User";`).

Confirm the match (as the opponent or an admin):

```bash
curl -X POST http://localhost:3000/api/matches/$MATCH_ID/confirm \
  -H "Cookie: next-auth.session-token=OPPONENT_SESSION_TOKEN"
```

Dispute (optional):

```bash
curl -X POST http://localhost:3000/api/matches/$MATCH_ID/dispute \
  -H "Cookie: next-auth.session-token=ADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Score entry mistake" }'
```

## 10. Inspecting Data

List players and ratings:

```bash
curl http://localhost:3000/api/rankings | jq
```

Retrieve a single player profile:

```bash
curl http://localhost:3000/api/users/<player-id> | jq
```

## 11. Stopping and Cleaning Up

```bash
docker compose down
```

To reset the database completely:

```bash
docker compose down -v
rm -rf prisma/migrations
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0001_init/migration.sql
npx prisma migrate deploy
npm run db:seed
```

## 12. Troubleshooting

| Issue | Fix |
| --- | --- |
| `Environment variable not found: DATABASE_URL` | Ensure `.env` exists and containers are restarted. |
| `next-auth` cookies missing | Sign in again; copy updated `next-auth.session-token`. |
| Docker build fails copying `public/` | Ensure `public/.gitkeep` exists (already tracked). |
| OAuth redirect mismatch | Update the OAuth app settings to match `NEXTAUTH_URL`. |

With these steps, you can build, run, and populate the tracker entirely from WSL2 while using Docker and the built-in APIs.
