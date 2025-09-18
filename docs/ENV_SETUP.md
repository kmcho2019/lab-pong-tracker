# Environment Variable Setup Guide

This beginner-friendly guide walks through creating, editing, and managing `.env` files for the Lab Pong Tracker.

## 1. What is a `.env` File?

A `.env` file stores key/value pairs that configure the app without hardcoding secrets in source code. Example:

```
DATABASE_URL=postgresql://user:password@localhost:5432/lab_pong?schema=public
NEXTAUTH_SECRET=your-secret
```

The application reads these values at runtime (via `dotenv` or Next.js). The file should not be committed to git.

## 2. Creating `.env`

1. Copy the template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in your editor (`nano .env`, `code .env`, etc.).
3. Fill in each variable:
   - `DATABASE_URL`: connection string to Postgres (see below).
   - `NEXTAUTH_URL`: usually `http://localhost:3000` in development.
   - `NEXTAUTH_SECRET`: generate via `openssl rand -base64 32`.
   - OAuth IDs/secrets: from Google/GitHub developer consoles.
   - `EMAIL_ALLOWLIST`: optional comma-separated emails for initial access.
4. Save the file.

## 3. Example Values (Local Development)

```
DATABASE_URL=postgresql://user:password@localhost:5432/lab_pong?schema=public
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-please-32-characters
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
EMAIL_ALLOWLIST=admin@example.com,player@example.com
```

## 4. Editing Safely

- Always stop the dev server before editing (`Ctrl+C`).
- After edits, restart (`npm run dev`) so changes load.
- Never share `.env` contents in public repos.

## 5. Multiple Environments

- `.env` – default (development).
- `.env.local` – overrides `.env` locally.
- `.env.production` – production overrides.

Next.js loads `.env`, `.env.local`, `.env.development`, `.env.production` automatically.

## 6. Referencing Variables in Code

- Server code uses `process.env.VAR_NAME`.
- Client components should not access secrets. Only expose public values with the `NEXT_PUBLIC_` prefix if needed.

Example (`src/server/auth.ts`):
```ts
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ''
});
```

## 7. Checking for Missing Values

If you see errors like “Environment variable not found: DATABASE_URL”, ensure `.env` exists and restart the app. You can use `npx env-cmd -f .env -- bash -c 'echo $DATABASE_URL'` to verify.

## 8. Sharing with Teammates

- Provide `.env.example` with placeholder values.
- Share real secrets through secure channels (password manager, encrypted vault).

## 9. Production Considerations

- Set env vars via hosting dashboard (`vercel env`, `fly secrets`, `docker compose` `.env` files).
- Rotate secrets periodically.
- Avoid storing production secrets in local `.env` files.

This guide ensures everyone can configure the application without prior experience.
