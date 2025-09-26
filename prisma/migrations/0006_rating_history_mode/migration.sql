-- CreateEnum
CREATE TYPE "RatingHistoryMode" AS ENUM ('OVERALL', 'SINGLES', 'DOUBLES');

-- AlterTable
ALTER TABLE "RatingHistory"
ADD COLUMN     "mode" "RatingHistoryMode" NOT NULL DEFAULT 'OVERALL';
