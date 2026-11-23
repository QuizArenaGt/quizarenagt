import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = path.resolve(import.meta.dirname, "../..");
const schemaPath = path.join(backendRoot, "prisma", "schema.prisma");
const migrationPath = path.join(
    backendRoot,
    "prisma",
    "migrations",
    "20261118181500_evolve_room_games_1_to_n",
    "migration.sql",
);

describe("Consolidação estática — Schema Prisma e Migration Room 1:N Game", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const sql = readFileSync(migrationPath, "utf8");

    it("deve separar os enums RoomStatus (ACTIVE/ARCHIVED) e GameStatus (WAITING/IN_PROGRESS/FINISHED/CANCELLED) no schema.prisma", () => {
        expect(schema).toMatch(/enum RoomStatus\s*\{\s*ACTIVE\s+ARCHIVED\s*\}/);
        expect(schema).toMatch(
            /enum GameStatus\s*\{\s*WAITING\s+IN_PROGRESS\s+FINISHED\s+CANCELLED\s*\}/,
        );
    });

    it("deve modelar Room 1:N Game, GamePlayer, RoomQuestionSnapshot por Game e timestamps nullable em Game", () => {
        expect(schema).toContain("games        Game[]");
        expect(schema).toContain("model GamePlayer {");
        expect(schema).toContain("game_players_active_gameId_nickname_key");
        expect(schema).toContain("@@unique([gameId, userId])");
        expect(schema).toContain('@@map("game_players")');
        expect(schema).toContain("startedAt        DateTime?");
        expect(schema).toContain("finishedAt       DateTime?");
        expect(schema).toMatch(/model RoomQuestionSnapshot \{[\s\S]*gameId\s+String\s+@unique/);
        expect(schema).toContain("@@unique([roundId, gamePlayerId])");
    });

    it("deve envolver toda a migration em transação atômica BEGIN...COMMIT sem comandos destrutivos de banco", () => {
        const sqlWithoutComments = sql
            .replace(/^\s*--[^\n]*(?:\r?\n|$)/gm, "")
            .trim();
        expect(sqlWithoutComments.startsWith("BEGIN;")).toBe(true);
        expect(sqlWithoutComments.endsWith("COMMIT;")).toBe(true);
        expect(sql).not.toMatch(/CONCURRENTLY/i);
        expect(sql).not.toMatch(/DROP TABLE/i);
        expect(sql).not.toMatch(/TRUNCATE/i);
    });

    it("deve manter startedAt e finishedAt como NULL no backfill de novos Games sem inferir ou aproximar timestamps", () => {
        const section4aMatch = sql.match(/-- 4a\.[\s\S]*?(?=-- 4b\.)/);
        expect(section4aMatch).not.toBeNull();
        expect(section4aMatch![0]).not.toMatch(/"finishedAt"\s*=/);
        expect(section4aMatch![0]).not.toMatch(/"startedAt"\s*=/);
        expect(section4aMatch![0]).not.toContain("MAX(");
        expect(sql).not.toMatch(/MAX\s*\(\s*rd\."closedAt"/i);
        expect(section4aMatch![0]).toContain('"updatedAt" = r."updatedAt"');

        const section4bMatch = sql.match(/-- 4b\.[\s\S]*?(?=-- =)/);
        expect(section4bMatch).not.toBeNull();
        expect(section4bMatch![0]).not.toContain('s."createdAt"');
        expect(section4bMatch![0]).toMatch(/VALUES\s*\([\s\S]*?NULL,\s*NULL,/);
        expect(sql).toContain('ag."startedAt" IS DISTINCT FROM bg."startedAt"');
        expect(sql).toContain('ag."finishedAt" IS DISTINCT FROM bg."finishedAt"');
        expect(sql).toContain("ag.\"status\"::text = 'IN_PROGRESS'");
        expect(sql).toContain('invalid_room."oldStatus"');
        expect(sql).toContain("npx prisma migrate dev --create-only");
    });

    it("deve conter pré-validações, triggers de imutabilidade/integridade e pós-validações completas", () => {
        expect(sql).toContain('CREATE UNIQUE INDEX "games_one_active_per_room_key"');
        expect(sql).toContain('CREATE OR REPLACE FUNCTION "prevent_structural_link_update"()');
        expect(sql).toContain('CREATE OR REPLACE FUNCTION "enforce_round_snapshot_game_integrity"()');
        expect(sql).toContain('CREATE OR REPLACE FUNCTION "enforce_round_answer_integrity"()');
        expect(sql).toContain("FOR KEY SHARE OF");
        expect(sql).toContain('CREATE TEMP TABLE "_audit_rooms_before" ON COMMIT DROP');
        expect(sql).toContain('CREATE TEMP TABLE "_audit_answers_before" ON COMMIT DROP');
    });
});
