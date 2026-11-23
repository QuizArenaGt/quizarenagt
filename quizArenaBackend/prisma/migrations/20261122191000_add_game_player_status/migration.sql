CREATE TYPE "GamePlayerStatus" AS ENUM ('ACTIVE', 'LEFT', 'ABANDONED');

ALTER TABLE "game_players"
ADD COLUMN "status" "GamePlayerStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "game_players_gameId_status_idx" ON "game_players"("gameId", "status");
