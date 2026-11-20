-- Migration aditiva: persiste o prazo autoritativo de expiração das rodadas (`expiresAt`)
-- preservando integralmente rodadas, respostas e pontuações históricas existentes.
BEGIN;

ALTER TABLE "rounds"
    ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "rounds"
SET "expiresAt" = "openedAt" + ("timeLimit" * INTERVAL '1 second')
WHERE "expiresAt" IS NULL;

ALTER TABLE "rounds"
    ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "rounds_open_expiresAt_idx"
    ON "rounds" ("expiresAt")
    WHERE "status" = 'OPEN';

COMMIT;
