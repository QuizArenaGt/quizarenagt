-- CreateTable
CREATE TABLE "round_answers" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roomPlayerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "round_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "round_answers_roundId_roomPlayerId_key" ON "round_answers"("roundId", "roomPlayerId");

-- AddForeignKey
ALTER TABLE "round_answers" ADD CONSTRAINT "round_answers_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_answers" ADD CONSTRAINT "round_answers_roomPlayerId_fkey" FOREIGN KEY ("roomPlayerId") REFERENCES "room_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_answers" ADD CONSTRAINT "round_answers_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "room_question_snapshot_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
