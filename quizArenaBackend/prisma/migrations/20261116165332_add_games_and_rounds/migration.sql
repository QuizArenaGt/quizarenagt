-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "snapshotQuestionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "timeLimit" INTEGER NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_roomId_key" ON "games"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_gameId_roundNumber_key" ON "rounds"("gameId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_gameId_snapshotQuestionId_key" ON "rounds"("gameId", "snapshotQuestionId");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_snapshotQuestionId_fkey" FOREIGN KEY ("snapshotQuestionId") REFERENCES "room_question_snapshot_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure only one open round per game
CREATE UNIQUE INDEX "rounds_one_open_per_game_key"
ON "rounds" ("gameId")
WHERE "status" = 'OPEN';