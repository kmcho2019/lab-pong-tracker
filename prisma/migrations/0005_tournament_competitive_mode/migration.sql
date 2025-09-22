-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('STANDARD', 'COMPETITIVE_MONTHLY');

-- AlterTable
ALTER TABLE "Tournament"
  ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN     "roundRobinIterations" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TournamentMatch"
  ADD COLUMN     "iteration" INTEGER NOT NULL DEFAULT 1;
