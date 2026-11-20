-- ============================================================================
-- NOTA OPERACIONAL IMPORTANTE (Prisma 6 + PostgreSQL):
-- Esta migration cria o índice único parcial "games_one_active_per_room_key"
-- e os triggers PL/pgSQL "prevent_structural_link_update",
-- "enforce_round_snapshot_game_integrity" e "enforce_round_answer_integrity"
-- (assim como a migration anterior criou "rounds_one_open_per_game_key").
-- Como o schema.prisma do Prisma 6 não representa índices parciais nem triggers,
-- futuras alterações de schema DEVEM usar `npx prisma migrate dev --create-only`
-- e ter o SQL gerado revisado manualmente para impedir qualquer DROP INDEX /
-- DROP TRIGGER indevido antes da execução.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DETECÇÃO PRÉ-BACKFILL DE INCONSISTÊNCIAS ESTRUTURAIS E DE TIMESTAMPS
-- ============================================================================
DO $$
DECLARE
    invalid_room RECORD;
BEGIN
    -- 1.1. Sala legada WAITING que já possui registro em games ou snapshot congelado -> Abortar
    SELECT r."id", r."code" INTO invalid_room
    FROM "rooms" r
    LEFT JOIN "games" g ON g."roomId" = r."id"
    LEFT JOIN "room_question_snapshots" s ON s."roomId" = r."id"
    WHERE r."status"::text = 'WAITING'
      AND (g."id" IS NOT NULL OR s."id" IS NOT NULL)
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Abortando migration: sala legada % (código %) está WAITING mas já possui Game ou Snapshot.',
            invalid_room."id", invalid_room."code";
    END IF;

    -- 1.2. Game pré-existente sem RoomQuestionSnapshot -> Abortar (evita perda de startedAt/rodadas)
    SELECT r."id", r."code" INTO invalid_room
    FROM "rooms" r
    JOIN "games" g ON g."roomId" = r."id"
    LEFT JOIN "room_question_snapshots" s ON s."roomId" = r."id"
    WHERE s."id" IS NULL
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Abortando migration: sala % (código %) possui registro em games sem RoomQuestionSnapshot.',
            invalid_room."id", invalid_room."code";
    END IF;

    -- 1.2b. Sala IN_PROGRESS sem Game, mas COM Snapshot (ou rodadas) -> Abortar
    -- (A normalização segura para WAITING só é permitida quando NÃO há Game, NÃO há Snapshot e NÃO há rodadas;
    -- nunca permitir criar Game IN_PROGRESS pelo backfill com startedAt NULL.)
    SELECT r."id", r."code" INTO invalid_room
    FROM "rooms" r
    LEFT JOIN "games" g ON g."roomId" = r."id"
    JOIN "room_question_snapshots" s ON s."roomId" = r."id"
    WHERE r."status"::text = 'IN_PROGRESS'
      AND g."id" IS NULL
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Abortando migration: sala % (código %) está IN_PROGRESS sem registro em games, porém possui RoomQuestionSnapshot.',
            invalid_room."id", invalid_room."code";
    END IF;

    -- 1.3. Sala WAITING ou IN_PROGRESS com Game já finalizado (finishedAt preenchido) -> Abortar
    SELECT r."id", r."code", r."status"::text AS "oldStatus" INTO invalid_room
    FROM "rooms" r
    JOIN "games" g ON g."roomId" = r."id"
    WHERE r."status"::text IN ('WAITING', 'IN_PROGRESS')
      AND g."finishedAt" IS NOT NULL
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Abortando migration: sala % (código %) está % mas possui Game com finishedAt preenchido.',
            invalid_room."id", invalid_room."code", invalid_room."oldStatus";
    END IF;

    -- 1.4. Sala FINISHED sem registro em games -> Abortar
    SELECT r."id", r."code" INTO invalid_room
    FROM "rooms" r
    LEFT JOIN "games" g ON g."roomId" = r."id"
    WHERE r."status"::text = 'FINISHED'
      AND g."id" IS NULL
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Abortando migration: sala % (código %) está FINISHED mas não possui registro em games.',
            invalid_room."id", invalid_room."code";
    END IF;

    -- 1.5. Sala FINISHED ou CANCELLED com rodada ainda OPEN -> Abortar
    SELECT r."id", r."code" INTO invalid_room
    FROM "rooms" r
    JOIN "games" g ON g."roomId" = r."id"
    JOIN "rounds" rd ON rd."gameId" = g."id"
    WHERE r."status"::text IN ('FINISHED', 'CANCELLED')
      AND rd."status"::text = 'OPEN'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Abortando migration: sala % (código %) está FINISHED/CANCELLED mas possui rodada OPEN.',
            invalid_room."id", invalid_room."code";
    END IF;

    -- 1.6. Inconsistências de status/timestamps em rounds
    IF EXISTS (
        SELECT 1 FROM "rounds"
        WHERE ("status"::text = 'OPEN' AND "closedAt" IS NOT NULL)
           OR ("status"::text = 'CLOSED' AND "closedAt" IS NULL)
           OR ("closedAt" IS NOT NULL AND "closedAt" < "openedAt")
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem rodadas com status e closedAt inconsistentes.';
    END IF;

    -- 1.7. Validações cronológicas entre Game, Round e RoundAnswer
    -- Nota de domínio: RoundAnswerRepository.submitAnswer e RoundRepository.closeRound serializam
    -- por SELECT ... FOR UPDATE em rounds utilizando o relógio do servidor; não há janela de tolerância
    -- que aceite respostas após Round.closedAt ou antes de Round.openedAt.
    IF EXISTS (
        SELECT 1 FROM "games" WHERE "finishedAt" IS NOT NULL AND "finishedAt" < "startedAt"
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem partidas com finishedAt < startedAt.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "rounds" rd
        JOIN "games" g ON g."id" = rd."gameId"
        WHERE rd."openedAt" < g."startedAt"
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem rodadas com openedAt anterior a Game.startedAt.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "rounds" rd
        JOIN "games" g ON g."id" = rd."gameId"
        WHERE g."finishedAt" IS NOT NULL
          AND rd."closedAt" IS NOT NULL
          AND rd."closedAt" > g."finishedAt"
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem rodadas com closedAt posterior a Game.finishedAt.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "round_answers" ra
        JOIN "rounds" rd ON rd."id" = ra."roundId"
        WHERE ra."answeredAt" < rd."openedAt"
           OR (rd."closedAt" IS NOT NULL AND ra."answeredAt" > rd."closedAt")
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem respostas fora do intervalo [Round.openedAt, Round.closedAt].';
    END IF;

    -- 1.8. Cruzamentos inválidos de snapshot/player/option
    IF EXISTS (
        SELECT 1
        FROM "rounds" rd
        JOIN "games" g ON g."id" = rd."gameId"
        JOIN "room_question_snapshot_questions" sq ON sq."id" = rd."snapshotQuestionId"
        JOIN "room_question_snapshots" s ON s."id" = sq."snapshotId"
        WHERE g."roomId" <> s."roomId"
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem rounds vinculadas a snapshot de outra sala.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "round_answers" ra
        JOIN "rounds" rd ON rd."id" = ra."roundId"
        JOIN "games" g ON g."id" = rd."gameId"
        JOIN "room_players" rp ON rp."id" = ra."roomPlayerId"
        WHERE g."roomId" <> rp."roomId"
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem respostas vinculadas a jogadores de outra sala.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "round_answers" ra
        JOIN "rounds" rd ON rd."id" = ra."roundId"
        JOIN "room_question_snapshot_options" so ON so."id" = ra."optionId"
        WHERE so."questionSnapshotId" <> rd."snapshotQuestionId"
    ) THEN
        RAISE EXCEPTION 'Abortando migration: existem respostas apontando para alternativa de outra pergunta.';
    END IF;
END $$;

-- ============================================================================
-- 2. CAPTURA COMPLETA DOS REGISTROS ANTES DO BACKFILL
-- ============================================================================
CREATE TEMP TABLE "_audit_rooms_before" ON COMMIT DROP AS
SELECT "id", "code", "hostId", "maxPlayers", "questionTime", "gameMode", "status"::text AS "oldStatus", "createdAt", "updatedAt"
FROM "rooms";

CREATE TEMP TABLE "_audit_games_before" ON COMMIT DROP AS
SELECT "id", "roomId", "startedAt", "finishedAt", "createdAt"
FROM "games";

CREATE TEMP TABLE "_audit_players_before" ON COMMIT DROP AS
SELECT "id", "roomId", "userId", "nickname", "score", "joinedAt", "sessionTokenHash"
FROM "room_players";

CREATE TEMP TABLE "_audit_snapshots_before" ON COMMIT DROP AS
SELECT "id", "roomId", "createdAt"
FROM "room_question_snapshots";

CREATE TEMP TABLE "_audit_snapshot_questions_before" ON COMMIT DROP AS
SELECT "id", "sourceQuestionId", "statement", "type", "position", "snapshotId"
FROM "room_question_snapshot_questions";

CREATE TEMP TABLE "_audit_snapshot_options_before" ON COMMIT DROP AS
SELECT "id", "sourceOptionId", "text", "isCorrect", "position", "questionSnapshotId"
FROM "room_question_snapshot_options";

CREATE TEMP TABLE "_audit_rounds_before" ON COMMIT DROP AS
SELECT "id", "gameId", "snapshotQuestionId", "roundNumber", "status", "openedAt", "closedAt", "timeLimit"
FROM "rounds";

CREATE TEMP TABLE "_audit_answers_before" ON COMMIT DROP AS
SELECT "id", "roundId", "roomPlayerId", "optionId", "answeredAt", "isCorrect", "points"
FROM "round_answers";

-- ============================================================================
-- 3. CRIAÇÃO DE GameStatus E EXPANSÃO DE rooms E games
-- ============================================================================
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

ALTER TABLE "rooms"
    ADD COLUMN "name" TEXT,
    ADD COLUMN "theme" TEXT,
    ADD COLUMN "archivedAt" TIMESTAMP(3);

DROP INDEX "games_roomId_key";

ALTER TABLE "games"
    ADD COLUMN "status" "GameStatus",
    ADD COLUMN "maxPlayers" INTEGER,
    ADD COLUMN "questionTime" INTEGER,
    ADD COLUMN "gameMode" "GameMode",
    ADD COLUMN "updatedAt" TIMESTAMP(3),
    ALTER COLUMN "startedAt" DROP NOT NULL,
    ALTER COLUMN "startedAt" DROP DEFAULT;

-- ============================================================================
-- 4. BACKFILL DE games (PRESERVAÇÃO INTEGRAL DE startedAt E finishedAt)
-- ============================================================================
-- 4a. Atualiza games pré-existentes preservando startedAt, finishedAt (inclusive NULL)
-- e a última atualização conhecida da sala (r."updatedAt") sem inferir timestamps
UPDATE "games" g
SET
    "status" = (r."status"::text)::"GameStatus",
    "maxPlayers" = r."maxPlayers",
    "questionTime" = r."questionTime",
    "gameMode" = r."gameMode",
    "updatedAt" = r."updatedAt"
FROM "rooms" r
WHERE g."roomId" = r."id";

-- 4b. Cria Game com UUID v4 sem colisão para salas sem registro prévio em games
-- Mantém startedAt = NULL e finishedAt = NULL (nunca usa snapshot.createdAt nem rooms.createdAt como startedAt)
DO $$
DECLARE
    missing_room RECORD;
    new_game_id TEXT;
BEGIN
    FOR missing_room IN
        SELECT
            r."id" AS "roomId",
            CASE
                WHEN r."status"::text = 'IN_PROGRESS' AND s."id" IS NULL THEN 'WAITING'::"GameStatus"
                ELSE (r."status"::text)::"GameStatus"
            END AS "targetStatus",
            r."maxPlayers",
            r."questionTime",
            r."gameMode",
            r."createdAt",
            r."updatedAt"
        FROM "rooms" r
        LEFT JOIN "games" g ON g."roomId" = r."id"
        LEFT JOIN "room_question_snapshots" s ON s."roomId" = r."id"
        WHERE g."id" IS NULL
    LOOP
        LOOP
            new_game_id := gen_random_uuid()::text;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "games" existing WHERE existing."id" = new_game_id
            );
        END LOOP;

        INSERT INTO "games" (
            "id",
            "roomId",
            "status",
            "maxPlayers",
            "questionTime",
            "gameMode",
            "startedAt",
            "finishedAt",
            "createdAt",
            "updatedAt"
        ) VALUES (
            new_game_id,
            missing_room."roomId",
            missing_room."targetStatus",
            missing_room."maxPlayers",
            missing_room."questionTime",
            missing_room."gameMode",
            NULL,
            NULL,
            missing_room."createdAt",
            missing_room."updatedAt"
        );
    END LOOP;
END $$;

ALTER TABLE "games"
    ALTER COLUMN "status" SET NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'WAITING',
    ALTER COLUMN "maxPlayers" SET NOT NULL,
    ALTER COLUMN "questionTime" SET NOT NULL,
    ALTER COLUMN "gameMode" SET NOT NULL,
    ALTER COLUMN "gameMode" SET DEFAULT 'CLASSIC',
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- ============================================================================
-- 5. CONVERSÃO DE Room.status PARA ('ACTIVE', 'ARCHIVED')
-- ============================================================================
UPDATE "rooms"
SET "archivedAt" = "updatedAt"
WHERE "status"::text = 'CANCELLED';

CREATE TYPE "RoomStatus_new" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "rooms" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "rooms"
    ALTER COLUMN "status" TYPE "RoomStatus_new"
    USING (
        CASE
            WHEN "status"::text = 'CANCELLED' THEN 'ARCHIVED'::"RoomStatus_new"
            ELSE 'ACTIVE'::"RoomStatus_new"
        END
    );

DROP TYPE "RoomStatus";
ALTER TYPE "RoomStatus_new" RENAME TO "RoomStatus";
ALTER TABLE "rooms" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- ============================================================================
-- 6. MIGRAÇÃO DE room_question_snapshots (roomId -> gameId)
-- ============================================================================
ALTER TABLE "room_question_snapshots" ADD COLUMN "gameId" TEXT;

UPDATE "room_question_snapshots" s
SET "gameId" = g."id"
FROM "games" g
WHERE g."roomId" = s."roomId";

ALTER TABLE "room_question_snapshots" ALTER COLUMN "gameId" SET NOT NULL;

ALTER TABLE "room_question_snapshots" DROP CONSTRAINT "room_question_snapshots_roomId_fkey";
DROP INDEX "room_question_snapshots_roomId_key";
ALTER TABLE "room_question_snapshots" DROP COLUMN "roomId";

CREATE UNIQUE INDEX "room_question_snapshots_gameId_key"
    ON "room_question_snapshots"("gameId");

ALTER TABLE "room_question_snapshots"
    ADD CONSTRAINT "room_question_snapshots_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "games"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 7. TRANSFORMAÇÃO DE room_players EM game_players (PRESERVANDO IDs)
-- ============================================================================
ALTER TABLE "round_answers" DROP CONSTRAINT "round_answers_roomPlayerId_fkey";
DROP INDEX "round_answers_roundId_roomPlayerId_key";

ALTER TABLE "room_players" RENAME TO "game_players";
ALTER TABLE "game_players" RENAME CONSTRAINT "room_players_pkey" TO "game_players_pkey";
ALTER INDEX "room_players_sessionTokenHash_key" RENAME TO "game_players_sessionTokenHash_key";
ALTER TABLE "game_players" RENAME CONSTRAINT "room_players_userId_fkey" TO "game_players_userId_fkey";

ALTER TABLE "game_players" ADD COLUMN "gameId" TEXT;

UPDATE "game_players" gp
SET "gameId" = g."id"
FROM "games" g
WHERE g."roomId" = gp."roomId";

ALTER TABLE "game_players" ALTER COLUMN "gameId" SET NOT NULL;

ALTER TABLE "game_players" DROP CONSTRAINT "room_players_roomId_fkey";
DROP INDEX "room_players_roomId_nickname_key";
DROP INDEX "room_players_roomId_userId_key";
ALTER TABLE "game_players" DROP COLUMN "roomId";

CREATE UNIQUE INDEX "game_players_gameId_nickname_key" ON "game_players"("gameId", "nickname");
CREATE UNIQUE INDEX "game_players_gameId_userId_key" ON "game_players"("gameId", "userId");
CREATE INDEX "game_players_gameId_joinedAt_idx" ON "game_players"("gameId", "joinedAt" ASC);

ALTER TABLE "game_players"
    ADD CONSTRAINT "game_players_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "games"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 8. ATUALIZAÇÃO DE round_answers (roomPlayerId -> gamePlayerId)
-- ============================================================================
ALTER TABLE "round_answers" RENAME COLUMN "roomPlayerId" TO "gamePlayerId";

CREATE UNIQUE INDEX "round_answers_roundId_gamePlayerId_key"
    ON "round_answers"("roundId", "gamePlayerId");

ALTER TABLE "round_answers"
    ADD CONSTRAINT "round_answers_gamePlayerId_fkey"
    FOREIGN KEY ("gamePlayerId") REFERENCES "game_players"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 9. ÍNDICES E TRIGGERS DE INTEGRIDADE E IMUTABILIDADE (COM FOR KEY SHARE)
-- ============================================================================
CREATE INDEX "rooms_hostId_status_createdAt_idx"
    ON "rooms"("hostId", "status", "createdAt" DESC);

CREATE INDEX "games_roomId_createdAt_idx"
    ON "games"("roomId", "createdAt" DESC);

CREATE INDEX "games_roomId_status_idx"
    ON "games"("roomId", "status");

CREATE UNIQUE INDEX "games_one_active_per_room_key"
    ON "games"("roomId")
    WHERE "status" IN ('WAITING', 'IN_PROGRESS');

-- 9a. Imutabilidade de vínculos estruturais em UPDATE (WHEN avaliado no schema específico de cada tabela)
CREATE OR REPLACE FUNCTION "prevent_structural_link_update"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Vínculo imutável em %: %.',
        TG_TABLE_NAME,
        COALESCE(TG_ARGV[0], 'chave estrutural não pode ser alterada')
        USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_immutable_games_links"
BEFORE UPDATE OF "roomId" ON "games"
FOR EACH ROW
WHEN (NEW."roomId" IS DISTINCT FROM OLD."roomId")
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar games.roomId');

CREATE TRIGGER "trg_immutable_snapshots_links"
BEFORE UPDATE OF "gameId" ON "room_question_snapshots"
FOR EACH ROW
WHEN (NEW."gameId" IS DISTINCT FROM OLD."gameId")
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar room_question_snapshots.gameId');

CREATE TRIGGER "trg_immutable_snapshot_questions_links"
BEFORE UPDATE OF "snapshotId" ON "room_question_snapshot_questions"
FOR EACH ROW
WHEN (NEW."snapshotId" IS DISTINCT FROM OLD."snapshotId")
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar room_question_snapshot_questions.snapshotId');

CREATE TRIGGER "trg_immutable_snapshot_options_links"
BEFORE UPDATE OF "questionSnapshotId" ON "room_question_snapshot_options"
FOR EACH ROW
WHEN (NEW."questionSnapshotId" IS DISTINCT FROM OLD."questionSnapshotId")
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar room_question_snapshot_options.questionSnapshotId');

CREATE TRIGGER "trg_immutable_game_players_links"
BEFORE UPDATE OF "gameId" ON "game_players"
FOR EACH ROW
WHEN (NEW."gameId" IS DISTINCT FROM OLD."gameId")
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar game_players.gameId');

CREATE TRIGGER "trg_immutable_rounds_links"
BEFORE UPDATE OF "gameId", "snapshotQuestionId", "roundNumber" ON "rounds"
FOR EACH ROW
WHEN (
    NEW."gameId" IS DISTINCT FROM OLD."gameId"
    OR NEW."snapshotQuestionId" IS DISTINCT FROM OLD."snapshotQuestionId"
    OR NEW."roundNumber" IS DISTINCT FROM OLD."roundNumber"
)
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar gameId, snapshotQuestionId ou roundNumber de uma rodada');

CREATE TRIGGER "trg_immutable_round_answers_links"
BEFORE UPDATE OF "roundId", "gamePlayerId", "optionId" ON "round_answers"
FOR EACH ROW
WHEN (
    NEW."roundId" IS DISTINCT FROM OLD."roundId"
    OR NEW."gamePlayerId" IS DISTINCT FROM OLD."gamePlayerId"
    OR NEW."optionId" IS DISTINCT FROM OLD."optionId"
)
EXECUTE FUNCTION "prevent_structural_link_update"('não é permitido alterar roundId, gamePlayerId ou optionId de uma resposta');

-- 9b. Trigger em rounds com bloqueio FOR KEY SHARE nos registros pais
CREATE OR REPLACE FUNCTION "enforce_round_snapshot_game_integrity"()
RETURNS TRIGGER AS $$
DECLARE
    snapshot_game_id TEXT;
BEGIN
    SELECT s."gameId" INTO snapshot_game_id
    FROM "room_question_snapshot_questions" sq
    JOIN "room_question_snapshots" s ON s."id" = sq."snapshotId"
    WHERE sq."id" = NEW."snapshotQuestionId"
    FOR KEY SHARE OF sq, s;

    IF snapshot_game_id IS NULL OR snapshot_game_id <> NEW."gameId" THEN
        RAISE EXCEPTION 'Violação de integridade: a pergunta do snapshot (%) não pertence à partida (%) da rodada.',
            NEW."snapshotQuestionId", NEW."gameId"
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_enforce_round_snapshot_game_integrity"
BEFORE INSERT OR UPDATE OF "gameId", "snapshotQuestionId" ON "rounds"
FOR EACH ROW
EXECUTE FUNCTION "enforce_round_snapshot_game_integrity"();

-- 9c. Trigger em round_answers com bloqueio FOR KEY SHARE nos registros pais
CREATE OR REPLACE FUNCTION "enforce_round_answer_integrity"()
RETURNS TRIGGER AS $$
DECLARE
    round_game_id TEXT;
    round_question_id TEXT;
    player_game_id TEXT;
    option_question_id TEXT;
BEGIN
    SELECT r."gameId", r."snapshotQuestionId"
    INTO round_game_id, round_question_id
    FROM "rounds" r
    WHERE r."id" = NEW."roundId"
    FOR KEY SHARE OF r;

    SELECT gp."gameId" INTO player_game_id
    FROM "game_players" gp
    WHERE gp."id" = NEW."gamePlayerId"
    FOR KEY SHARE OF gp;

    SELECT so."questionSnapshotId" INTO option_question_id
    FROM "room_question_snapshot_options" so
    WHERE so."id" = NEW."optionId"
    FOR KEY SHARE OF so;

    IF round_game_id IS NULL OR player_game_id IS NULL OR round_game_id <> player_game_id THEN
        RAISE EXCEPTION 'Violação de integridade: o jogador (%) não pertence à mesma partida da rodada (%).',
            NEW."gamePlayerId", NEW."roundId"
            USING ERRCODE = '23503';
    END IF;

    IF option_question_id IS NULL OR option_question_id <> round_question_id THEN
        RAISE EXCEPTION 'Violação de integridade: a alternativa (%) não pertence à pergunta da rodada (%).',
            NEW."optionId", NEW."roundId"
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_enforce_round_answer_integrity"
BEFORE INSERT OR UPDATE OF "roundId", "gamePlayerId", "optionId" ON "round_answers"
FOR EACH ROW
EXECUTE FUNCTION "enforce_round_answer_integrity"();

-- ============================================================================
-- 10. VALIDAÇÃO COMPLETA DE INTEGRIDADE PÓS-MIGRAÇÃO (TODOS OS CAMPOS)
-- ============================================================================
DO $$
BEGIN
    -- 10.1. Rooms: comparação completa de IDs, códigos, hostId, configs, status, archivedAt e timestamps
    IF (SELECT COUNT(*) FROM "rooms") <> (SELECT COUNT(*) FROM "_audit_rooms_before") OR EXISTS (
        SELECT 1
        FROM "_audit_rooms_before" b
        LEFT JOIN "rooms" a ON a."id" = b."id"
        WHERE a."id" IS NULL
           OR a."code" <> b."code"
           OR a."hostId" <> b."hostId"
           OR a."maxPlayers" <> b."maxPlayers"
           OR a."questionTime" <> b."questionTime"
           OR a."gameMode" <> b."gameMode"
           OR a."createdAt" <> b."createdAt"
           OR a."updatedAt" <> b."updatedAt"
           OR (b."oldStatus" = 'CANCELLED' AND (a."status"::text <> 'ARCHIVED' OR a."archivedAt" <> b."updatedAt"))
           OR (b."oldStatus" <> 'CANCELLED' AND (a."status"::text <> 'ACTIVE' OR a."archivedAt" IS NOT NULL))
    ) THEN
        RAISE EXCEPTION 'Falha de integridade pós-migração em rooms.';
    END IF;

    -- 10.2. Games: preservação integral de Games pré-existentes + verificação dos Games criados no backfill (startedAt/finishedAt = NULL)
    IF (SELECT COUNT(*) FROM "games") <> (SELECT COUNT(*) FROM "_audit_rooms_before")
       OR EXISTS (
           SELECT 1
           FROM "_audit_games_before" bg
           JOIN "_audit_rooms_before" br ON br."id" = bg."roomId"
           LEFT JOIN "games" ag ON ag."id" = bg."id"
           WHERE ag."id" IS NULL
              OR ag."roomId" <> bg."roomId"
              OR ag."status"::text <> br."oldStatus"
              OR ag."maxPlayers" <> br."maxPlayers"
              OR ag."questionTime" <> br."questionTime"
              OR ag."gameMode" <> br."gameMode"
              OR ag."createdAt" <> bg."createdAt"
              OR ag."updatedAt" <> br."updatedAt"
              OR ag."startedAt" IS DISTINCT FROM bg."startedAt"
              OR ag."finishedAt" IS DISTINCT FROM bg."finishedAt"
       )
       OR EXISTS (
           SELECT 1
           FROM "_audit_rooms_before" br
           LEFT JOIN "_audit_games_before" bg ON bg."roomId" = br."id"
           LEFT JOIN "games" ag ON ag."roomId" = br."id"
           LEFT JOIN "_audit_snapshots_before" bs ON bs."roomId" = br."id"
           WHERE bg."id" IS NULL
             AND (
                 ag."id" IS NULL
                 OR ag."id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                 OR EXISTS (SELECT 1 FROM "_audit_games_before" prev WHERE prev."id" = ag."id")
                 OR ag."maxPlayers" <> br."maxPlayers"
                 OR ag."questionTime" <> br."questionTime"
                 OR ag."gameMode" <> br."gameMode"
                 OR ag."createdAt" <> br."createdAt"
                 OR ag."updatedAt" <> br."updatedAt"
                 OR ag."status"::text = 'IN_PROGRESS'
                 OR (
                     br."oldStatus" = 'IN_PROGRESS' AND bs."id" IS NULL
                     AND ag."status"::text <> 'WAITING'
                 )
                 OR (
                     NOT (br."oldStatus" = 'IN_PROGRESS' AND bs."id" IS NULL)
                     AND ag."status"::text <> br."oldStatus"
                 )
                 OR ag."startedAt" IS NOT NULL
                 OR ag."finishedAt" IS NOT NULL
             )
       ) THEN
        RAISE EXCEPTION 'Falha de integridade pós-migração em games.';
    END IF;

    -- 10.3. GamePlayer: comparação completa de IDs, vínculo com o Game da antiga Room, userId, nickname, score, joinedAt e sessionTokenHash
    IF (SELECT COUNT(*) FROM "game_players") <> (SELECT COUNT(*) FROM "_audit_players_before")
       OR (SELECT COALESCE(SUM("score"), 0) FROM "game_players") <> (SELECT COALESCE(SUM("score"), 0) FROM "_audit_players_before")
       OR EXISTS (
        SELECT 1
        FROM "_audit_players_before" bp
        LEFT JOIN "game_players" ap ON ap."id" = bp."id"
        LEFT JOIN "games" g ON g."id" = ap."gameId"
        WHERE ap."id" IS NULL
           OR g."id" IS NULL
           OR g."roomId" <> bp."roomId"
           OR ap."userId" IS DISTINCT FROM bp."userId"
           OR ap."nickname" <> bp."nickname"
           OR ap."score" <> bp."score"
           OR ap."joinedAt" <> bp."joinedAt"
           OR ap."sessionTokenHash" IS DISTINCT FROM bp."sessionTokenHash"
    ) THEN
        RAISE EXCEPTION 'Falha de integridade pós-migração em game_players.';
    END IF;

    -- 10.4. Snapshots, perguntas e opções congeladas: comparação completa (incluindo snapshot.createdAt preservado)
    IF (SELECT COUNT(*) FROM "room_question_snapshots") <> (SELECT COUNT(*) FROM "_audit_snapshots_before")
       OR EXISTS (
           SELECT 1
           FROM "_audit_snapshots_before" bs
           LEFT JOIN "room_question_snapshots" s ON s."id" = bs."id"
           LEFT JOIN "games" g ON g."id" = s."gameId"
           WHERE s."id" IS NULL
              OR g."id" IS NULL
              OR g."roomId" <> bs."roomId"
              OR s."createdAt" <> bs."createdAt"
       )
       OR (SELECT COUNT(*) FROM "room_question_snapshot_questions") <> (SELECT COUNT(*) FROM "_audit_snapshot_questions_before")
       OR EXISTS (
           SELECT 1
           FROM "_audit_snapshot_questions_before" bsq
           LEFT JOIN "room_question_snapshot_questions" sq ON sq."id" = bsq."id"
           WHERE sq."id" IS NULL
              OR sq."sourceQuestionId" <> bsq."sourceQuestionId"
              OR sq."statement" <> bsq."statement"
              OR sq."type" <> bsq."type"
              OR sq."position" <> bsq."position"
              OR sq."snapshotId" <> bsq."snapshotId"
       )
       OR (SELECT COUNT(*) FROM "room_question_snapshot_options") <> (SELECT COUNT(*) FROM "_audit_snapshot_options_before")
       OR EXISTS (
           SELECT 1
           FROM "_audit_snapshot_options_before" bso
           LEFT JOIN "room_question_snapshot_options" so ON so."id" = bso."id"
           WHERE so."id" IS NULL
              OR so."sourceOptionId" <> bso."sourceOptionId"
              OR so."text" <> bso."text"
              OR so."isCorrect" <> bso."isCorrect"
              OR so."position" <> bso."position"
              OR so."questionSnapshotId" <> bso."questionSnapshotId"
       ) THEN
        RAISE EXCEPTION 'Falha de integridade pós-migração nos snapshots de perguntas/opções.';
    END IF;

    -- 10.5. Rounds: comparação completa e vínculo com o mesmo Game do snapshot
    IF (SELECT COUNT(*) FROM "rounds") <> (SELECT COUNT(*) FROM "_audit_rounds_before") OR EXISTS (
        SELECT 1
        FROM "_audit_rounds_before" br
        LEFT JOIN "rounds" r ON r."id" = br."id"
        LEFT JOIN "room_question_snapshot_questions" sq ON sq."id" = r."snapshotQuestionId"
        LEFT JOIN "room_question_snapshots" s ON s."id" = sq."snapshotId"
        WHERE r."id" IS NULL
           OR sq."id" IS NULL
           OR s."id" IS NULL
           OR r."gameId" <> br."gameId"
           OR r."snapshotQuestionId" <> br."snapshotQuestionId"
           OR r."roundNumber" <> br."roundNumber"
           OR r."status" <> br."status"
           OR r."openedAt" <> br."openedAt"
           OR r."closedAt" IS DISTINCT FROM br."closedAt"
           OR r."timeLimit" <> br."timeLimit"
           OR r."gameId" <> s."gameId"
    ) THEN
        RAISE EXCEPTION 'Falha de integridade pós-migração em rounds.';
    END IF;

    -- 10.6. RoundAnswers: comparação completa e vínculo com mesmo Game e mesma Pergunta
    IF (SELECT COUNT(*) FROM "round_answers") <> (SELECT COUNT(*) FROM "_audit_answers_before")
       OR (SELECT COALESCE(SUM("points"), 0) FROM "round_answers") <> (SELECT COALESCE(SUM("points"), 0) FROM "_audit_answers_before")
       OR EXISTS (
        SELECT 1
        FROM "_audit_answers_before" bra
        LEFT JOIN "round_answers" ra ON ra."id" = bra."id"
        LEFT JOIN "rounds" r ON r."id" = ra."roundId"
        LEFT JOIN "game_players" gp ON gp."id" = ra."gamePlayerId"
        LEFT JOIN "room_question_snapshot_options" so ON so."id" = ra."optionId"
        WHERE ra."id" IS NULL
           OR r."id" IS NULL
           OR gp."id" IS NULL
           OR so."id" IS NULL
           OR ra."roundId" <> bra."roundId"
           OR ra."gamePlayerId" <> bra."roomPlayerId"
           OR ra."optionId" <> bra."optionId"
           OR ra."isCorrect" <> bra."isCorrect"
           OR ra."points" <> bra."points"
           OR ra."answeredAt" <> bra."answeredAt"
           OR r."gameId" <> gp."gameId"
           OR so."questionSnapshotId" <> r."snapshotQuestionId"
    ) THEN
        RAISE EXCEPTION 'Falha de integridade pós-migração em round_answers.';
    END IF;
END $$;

COMMIT;
