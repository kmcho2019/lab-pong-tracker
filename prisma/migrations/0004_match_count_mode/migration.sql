BEGIN;

CREATE TYPE "TournamentMatchCountMode" AS ENUM ('PER_PLAYER', 'TOTAL_MATCHES');

ALTER TABLE "Tournament"
  ADD COLUMN "matchCountMode" "TournamentMatchCountMode" NOT NULL DEFAULT 'PER_PLAYER',
  ADD COLUMN "matchesPerPlayer" INTEGER DEFAULT 3,
  ALTER COLUMN "gamesPerGroup" DROP NOT NULL,
  ALTER COLUMN "gamesPerGroup" SET DEFAULT 8;

UPDATE "Tournament"
SET "matchCountMode" = 'TOTAL_MATCHES'
WHERE "gamesPerGroup" IS NOT NULL;

UPDATE "Tournament"
SET "matchesPerPlayer" = NULL
WHERE "matchCountMode" = 'TOTAL_MATCHES';

COMMIT;
