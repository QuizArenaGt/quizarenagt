DROP INDEX IF EXISTS "game_players_gameId_nickname_key";

CREATE UNIQUE INDEX "game_players_active_gameId_nickname_key"
ON "game_players"("gameId", "nickname")
WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "game_players_gameId_nickname_idx"
ON "game_players"("gameId", "nickname");
