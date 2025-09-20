#!/usr/bin/env node
const { execSync } = require('node:child_process');

if (process.env.SKIP_PRISMA_MIGRATE === '1') {
  console.log('[migrate] SKIP_PRISMA_MIGRATE=1 detected, skipping automatic migrations.');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('[migrate] DATABASE_URL not set. Skipping automatic prisma migrate deploy.');
  process.exit(0);
}

const strict = process.env.PRISMA_AUTO_MIGRATE_STRICT === '1';

try {
  console.log('[migrate] Running `prisma migrate deploy`...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[migrate] Migrations applied successfully.');
} catch (error) {
  console.error('[migrate] Failed to apply migrations.');
  if (strict) {
    console.error('[migrate] PRISMA_AUTO_MIGRATE_STRICT=1, exiting with failure.');
    process.exit(error.status ?? 1);
  }
  console.error('[migrate] Continuing without applying migrations because strict mode is disabled.');
}
