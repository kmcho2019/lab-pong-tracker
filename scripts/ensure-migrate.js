#!/usr/bin/env node
const { execSync } = require('node:child_process');

const databaseUrl = process.env.DATABASE_URL;
const skip = process.env.SKIP_PRISMA_MIGRATE === '1';
const strict = process.env.PRISMA_AUTO_MIGRATE_STRICT === '1';
const autoRecompute = process.env.PRISMA_AUTO_RECOMPUTE !== '0';

if (skip) {
  console.log('[migrate] SKIP_PRISMA_MIGRATE=1, skipping automatic migrations.');
  process.exit(0);
}

if (!databaseUrl) {
  console.warn('[migrate] DATABASE_URL not set. Skipping automatic prisma migrate deploy.');
  process.exit(0);
}

try {
  console.log('[migrate] Running `prisma migrate deploy`...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[migrate] Migrations applied successfully.');
} catch (error) {
  console.error('[migrate] Failed to apply migrations.');
  if (strict) {
    console.error('[migrate] Strict mode enabled; aborting.');
    process.exit(error.status ?? 1);
  }
  console.error('[migrate] Continuing without applying migrations because strict mode is disabled.');
}

if (autoRecompute) {
  try {
    console.log('[migrate] PRISMA_AUTO_RECOMPUTE=1 → running league recompute');
    execSync('npx tsx scripts/sync-mode-ratings.ts', { stdio: 'inherit' });
    console.log('[migrate] Recompute finished successfully.');
  } catch (error) {
    console.error('[migrate] League recompute failed.');
    if (strict) {
      console.error('[migrate] Strict mode enabled; aborting.');
      process.exit(error.status ?? 1);
    }
    console.error('[migrate] Continuing despite recompute failure.');
  }
}
