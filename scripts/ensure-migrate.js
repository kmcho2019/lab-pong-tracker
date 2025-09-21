#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf-8',
    ...options
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function resolveFailedMigration(migrationName) {
  console.warn(`[migrate] Detected failed migration ${migrationName}; marking as rolled back.`);
  const resolveResult = runCommand('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', migrationName]);
  if (resolveResult.status !== 0 && strict) {
    console.error('[migrate] Failed to mark migration as rolled back; aborting due to strict mode.');
    process.exit(resolveResult.status ?? 1);
  }
  return resolveResult.status === 0;
}

function applyMigrations() {
  console.log('[migrate] Running `prisma migrate deploy`...');
  const result = runCommand('npx', ['prisma', 'migrate', 'deploy']);

  if (result.status === 0) {
    console.log('[migrate] Migrations applied successfully.');
    return true;
  }

  const combinedOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (combinedOutput.includes('P3009') && combinedOutput.includes('0003_add_tournaments')) {
    const resolved = resolveFailedMigration('0003_add_tournaments');
    if (resolved) {
      const retry = runCommand('npx', ['prisma', 'migrate', 'deploy']);
      if (retry.status === 0) {
        console.log('[migrate] Migrations applied successfully after resolving failed state.');
        return true;
      }
      if (strict) {
        process.exit(retry.status ?? 1);
      }
      console.error('[migrate] Retry after resolving migration failed.');
      return false;
    }
  }

  console.error('[migrate] Failed to apply migrations.');
  if (strict) {
    console.error('[migrate] Strict mode enabled; aborting.');
    process.exit(result.status ?? 1);
  }
  return false;
}

const migrationsApplied = applyMigrations();
if (!migrationsApplied) {
  console.error('[migrate] Continuing without applying migrations because strict mode is disabled.');
}

if (autoRecompute) {
  try {
    console.log('[migrate] PRISMA_AUTO_RECOMPUTE=1 → running league recompute');
    const recomputeSource = path.join(__dirname, '../src/server/recompute.ts');
    if (!fs.existsSync(recomputeSource)) {
      console.warn('[migrate] Skipping recompute: src/server/recompute.ts not found in runtime image.');
    } else {
      const recomputeResult = runCommand('npx', ['tsx', path.join(__dirname, 'sync-mode-ratings.ts')]);
      if (recomputeResult.status === 0) {
        console.log('[migrate] Recompute finished successfully.');
      } else {
        throw Object.assign(new Error('League recompute failed'), { status: recomputeResult.status ?? 1 });
      }
    }
  } catch (error) {
    console.error('[migrate] League recompute failed.');
    if (strict) {
      console.error('[migrate] Strict mode enabled; aborting.');
      process.exit(error.status ?? 1);
    }
    console.error('[migrate] Continuing despite recompute failure.');
  }
}
