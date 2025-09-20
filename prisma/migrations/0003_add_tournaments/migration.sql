BEGIN;

CREATE TYPE "TournamentMode" AS ENUM ('SINGLES', 'DOUBLES');
CREATE TYPE "TournamentStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TournamentMatchStatus" AS ENUM ('SCHEDULED', 'PLAYED', 'CANCELLED');

CREATE TABLE "Tournament" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "mode" "TournamentMode" NOT NULL,
  "status" "TournamentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "gamesPerGroup" INTEGER NOT NULL DEFAULT 8,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "Tournament_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Tournament_startAt_idx" ON "Tournament"("startAt");

CREATE TABLE "TournamentGroup" (
  "id" TEXT PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tableLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentGroup_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TournamentGroup_tournamentId_name_key" ON "TournamentGroup"("tournamentId", "name");

CREATE TABLE "TournamentParticipant" (
  "id" TEXT PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seed" INTEGER,
  "groupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE,
  CONSTRAINT "TournamentParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "TournamentParticipant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_userId_key" ON "TournamentParticipant"("tournamentId", "userId");
CREATE INDEX "TournamentParticipant_groupId_idx" ON "TournamentParticipant"("groupId");

CREATE TABLE "TournamentMatch" (
  "id" TEXT PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "status" "TournamentMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
  "team1Ids" TEXT[] NOT NULL,
  "team2Ids" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE,
  CONSTRAINT "TournamentMatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE
);
CREATE INDEX "TournamentMatch_status_idx" ON "TournamentMatch"("status");

ALTER TABLE "Match"
  ADD COLUMN "tournamentMatchId" TEXT,
  ADD CONSTRAINT "Match_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "TournamentMatch"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "Match_tournamentMatchId_key" ON "Match"("tournamentMatchId");

COMMIT;
