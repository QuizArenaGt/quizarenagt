
import { describe, expect, it } from "vitest";

import { validateJoinRoom } from "../../src/rooms/join-room.dto.js";

describe("validateJoinRoom", () => {
    it("deve validar dados corretos", () => {
        const result = validateJoinRoom({
            code: "abc123",
            nickname: "Gendesson",
        });

        expect(result).toEqual({
            success: true,
            data: {
                code: "ABC123",
                nickname: "Gendesson",
            },
        });
    });

    it("deve remover espaços externos do nickname", () => {
        const result = validateJoinRoom({
            code: "ABC123",
            nickname: "  Jogador  ",
        });

        expect(result).toEqual({
            success: true,
            data: {
                code: "ABC123",
                nickname: "Jogador",
            },
        });
    });

    it("deve rejeitar corpo que não seja um objeto", () => {
        const result = validateJoinRoom(null);

        expect(result).toEqual({
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto.",
            },
        });
    });

    it("deve rejeitar código ausente", () => {
        const result = validateJoinRoom({
            nickname: "Jogador",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors.code).toBe(
                "O código da sala é obrigatório.",
            );
        }
    });

    it("deve rejeitar código com tamanho inválido", () => {
        const result = validateJoinRoom({
            code: "ABC",
            nickname: "Jogador",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors.code).toBe(
                "O código da sala deve possuir 6 caracteres.",
            );
        }
    });

    it("deve rejeitar nickname ausente", () => {
        const result = validateJoinRoom({
            code: "ABC123",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors.nickname).toBe(
                "O nickname é obrigatório.",
            );
        }
    });

    it("deve rejeitar nickname com menos de 2 caracteres", () => {
        const result = validateJoinRoom({
            code: "ABC123",
            nickname: "A",
        });

        expect(result.success).toBe(false);
    });

    it("deve rejeitar nickname com mais de 20 caracteres", () => {
        const result = validateJoinRoom({
            code: "ABC123",
            nickname: "JogadorComNomeMuitoGrande",
        });

        expect(result.success).toBe(false);
    });

    it("deve rejeitar código e nickname com tipos inválidos", () => {
        const result = validateJoinRoom({
            code: 123456,
            nickname: 123,
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors.code).toBeDefined();
            expect(result.errors.nickname).toBeDefined();
        }
    });
});
