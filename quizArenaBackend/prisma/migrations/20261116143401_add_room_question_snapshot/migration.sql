
-- Adiciona position temporariamente como nullable para permitir o backfill.
ALTER TABLE "question_options"
ADD COLUMN "position" INTEGER;

-- Define posições determinísticas para as opções já existentes.
-- O schema anterior não armazenava ordem, portanto usamos o ID como critério.
WITH ranked_options AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "questionId"
            ORDER BY "id"
        ) - 1 AS position
    FROM "question_options"
)
UPDATE "question_options" AS options
SET "position" = ranked_options.position
FROM ranked_options
WHERE options."id" = ranked_options."id";

-- Torna a posição obrigatória após preencher os registros existentes.
ALTER TABLE "question_options"
ALTER COLUMN "position" SET NOT NULL;

-- Cria unicidade da posição dentro de cada pergunta.
CREATE UNIQUE INDEX "question_options_questionId_position_key"
ON "question_options"("questionId", "position");

-- Snapshot principal da sala.
CREATE TABLE "room_question_snapshots" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_question_snapshots_pkey" PRIMARY KEY ("id")
);

-- Perguntas copiadas para o snapshot.
CREATE TABLE "room_question_snapshot_questions" (
    "id" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "position" INTEGER NOT NULL,
    "snapshotId" TEXT NOT NULL,

    CONSTRAINT "room_question_snapshot_questions_pkey" PRIMARY KEY ("id")
);

-- Opções copiadas para cada pergunta do snapshot.
CREATE TABLE "room_question_snapshot_options" (
    "id" TEXT NOT NULL,
    "sourceOptionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "questionSnapshotId" TEXT NOT NULL,

    CONSTRAINT "room_question_snapshot_options_pkey" PRIMARY KEY ("id")
);

-- Índices únicos.
CREATE UNIQUE INDEX "room_question_snapshots_roomId_key"
ON "room_question_snapshots"("roomId");

CREATE UNIQUE INDEX "room_question_snapshot_questions_snapshotId_position_key"
ON "room_question_snapshot_questions"("snapshotId", "position");

CREATE UNIQUE INDEX "room_question_snapshot_options_questionSnapshotId_position_key"
ON "room_question_snapshot_options"("questionSnapshotId", "position");

-- Relacionamentos.
ALTER TABLE "room_question_snapshots"
ADD CONSTRAINT "room_question_snapshots_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_question_snapshot_questions"
ADD CONSTRAINT "room_question_snapshot_questions_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "room_question_snapshots"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_question_snapshot_options"
ADD CONSTRAINT "room_question_snapshot_options_questionSnapshotId_fkey"
FOREIGN KEY ("questionSnapshotId") REFERENCES "room_question_snapshot_questions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
