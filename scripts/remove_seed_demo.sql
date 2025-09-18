-- Remove seeded demo users and their associated matches.
-- Usage: psql -U <user> -d <database> -f scripts/remove_seed_demo.sql

BEGIN;

-- Delete audit logs connected to demo matches
WITH target_users AS (
  SELECT id
  FROM "User"
  WHERE email IN (
    'kim@example.com',
    'han@example.com',
    'park@example.com',
    'sofia@example.com'
  )
),
target_matches AS (
  SELECT DISTINCT m.id
  FROM "Match" m
  WHERE m."enteredById" IN (SELECT id FROM target_users)
     OR m."confirmedById" IN (SELECT id FROM target_users)
     OR EXISTS (
       SELECT 1
       FROM "MatchParticipant" mp
       WHERE mp."matchId" = m.id
         AND mp."userId" IN (SELECT id FROM target_users)
     )
)
DELETE FROM "AuditLog"
WHERE "matchId" IN (SELECT id FROM target_matches);

-- Delete rating history rows touching those users or matches
WITH target_users AS (
  SELECT id
  FROM "User"
  WHERE email IN (
    'kim@example.com',
    'han@example.com',
    'park@example.com',
    'sofia@example.com'
  )
),
target_matches AS (
  SELECT DISTINCT m.id
  FROM "Match" m
  WHERE m."enteredById" IN (SELECT id FROM target_users)
     OR m."confirmedById" IN (SELECT id FROM target_users)
     OR EXISTS (
       SELECT 1
       FROM "MatchParticipant" mp
       WHERE mp."matchId" = m.id
         AND mp."userId" IN (SELECT id FROM target_users)
     )
)
DELETE FROM "RatingHistory"
WHERE "matchId" IN (SELECT id FROM target_matches)
   OR "userId" IN (SELECT id FROM target_users);

-- Delete participants for affected matches
WITH target_users AS (
  SELECT id
  FROM "User"
  WHERE email IN (
    'kim@example.com',
    'han@example.com',
    'park@example.com',
    'sofia@example.com'
  )
),
target_matches AS (
  SELECT DISTINCT m.id
  FROM "Match" m
  WHERE m."enteredById" IN (SELECT id FROM target_users)
     OR m."confirmedById" IN (SELECT id FROM target_users)
     OR EXISTS (
       SELECT 1
       FROM "MatchParticipant" mp
       WHERE mp."matchId" = m.id
         AND mp."userId" IN (SELECT id FROM target_users)
     )
)
DELETE FROM "MatchParticipant"
WHERE "matchId" IN (SELECT id FROM target_matches);

-- Delete teams for affected matches
WITH target_users AS (
  SELECT id
  FROM "User"
  WHERE email IN (
    'kim@example.com',
    'han@example.com',
    'park@example.com',
    'sofia@example.com'
  )
),
target_matches AS (
  SELECT DISTINCT m.id
  FROM "Match" m
  WHERE m."enteredById" IN (SELECT id FROM target_users)
     OR m."confirmedById" IN (SELECT id FROM target_users)
     OR EXISTS (
       SELECT 1
       FROM "MatchParticipant" mp
       WHERE mp."matchId" = m.id
         AND mp."userId" IN (SELECT id FROM target_users)
     )
)
DELETE FROM "MatchTeam"
WHERE "matchId" IN (SELECT id FROM target_matches);

-- Delete matches themselves
WITH target_users AS (
  SELECT id
  FROM "User"
  WHERE email IN (
    'kim@example.com',
    'han@example.com',
    'park@example.com',
    'sofia@example.com'
  )
),
target_matches AS (
  SELECT DISTINCT m.id
  FROM "Match" m
  WHERE m."enteredById" IN (SELECT id FROM target_users)
     OR m."confirmedById" IN (SELECT id FROM target_users)
     OR EXISTS (
       SELECT 1
       FROM "MatchParticipant" mp
       WHERE mp."matchId" = m.id
         AND mp."userId" IN (SELECT id FROM target_users)
     )
)
DELETE FROM "Match"
WHERE id IN (SELECT id FROM target_matches);

-- Remove any allowlist rows for these users
DELETE FROM "AllowlistEmail"
WHERE email IN (
  'kim@example.com',
  'han@example.com',
  'park@example.com',
  'sofia@example.com'
);

-- Finally delete the users themselves
DELETE FROM "User"
WHERE email IN (
  'kim@example.com',
  'han@example.com',
  'park@example.com',
  'sofia@example.com'
);

COMMIT;
