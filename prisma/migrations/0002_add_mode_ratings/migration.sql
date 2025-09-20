-- add singles/doubles rating columns with defaults and migrate existing data
BEGIN;

ALTER TABLE "User"
  ADD COLUMN "singlesRating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
  ADD COLUMN "singlesRd" DOUBLE PRECISION NOT NULL DEFAULT 350,
  ADD COLUMN "singlesVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  ADD COLUMN "singlesLastMatchAt" TIMESTAMP(3),
  ADD COLUMN "singlesWins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "singlesLosses" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doublesRating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
  ADD COLUMN "doublesRd" DOUBLE PRECISION NOT NULL DEFAULT 350,
  ADD COLUMN "doublesVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  ADD COLUMN "doublesLastMatchAt" TIMESTAMP(3),
  ADD COLUMN "doublesWins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doublesLosses" INTEGER NOT NULL DEFAULT 0;

-- seed new columns with existing overall stats for backward compatibility
UPDATE "User"
SET
  "singlesRating" = "glickoRating",
  "singlesRd" = "glickoRd",
  "singlesVolatility" = "glickoVolatility",
  "singlesWins" = "wins",
  "singlesLosses" = "losses",
  "singlesLastMatchAt" = "lastMatchAt",
  "doublesRating" = "glickoRating",
  "doublesRd" = "glickoRd",
  "doublesVolatility" = "glickoVolatility",
  "doublesWins" = "wins",
  "doublesLosses" = "losses",
  "doublesLastMatchAt" = "lastMatchAt";

COMMIT;
