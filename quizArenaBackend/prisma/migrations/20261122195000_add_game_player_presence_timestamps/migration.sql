ALTER TABLE "game_players"
ADD COLUMN "disconnectedAt" TIMESTAMP(3),
ADD COLUMN "reconnectDeadlineAt" TIMESTAMP(3);

CREATE INDEX "game_players_status_reconnectDeadlineAt_idx"
ON "game_players"("status", "reconnectDeadlineAt");
