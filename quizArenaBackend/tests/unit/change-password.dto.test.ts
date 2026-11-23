import { describe, expect, it } from "vitest";
import {
    CHANGE_PASSWORD_MAX_BYTES,
    CHANGE_PASSWORD_MIN_LENGTH,
    validateChangePassword,
} from "../../src/auth/change-password.dto.js";

describe("validateChangePassword", () => {
    it("rejeita corpo não-objeto", () => {
        expect(validateChangePassword(null)).toEqual({
            success: false,
            errors: { body: "O corpo da requisição deve ser um objeto." },
        });
        expect(validateChangePassword([])).toEqual({
            success: false,
            errors: { body: "O corpo da requisição deve ser um objeto." },
        });
    });

    it("exige senha atual e nova senha válida entre 8 caracteres e 72 bytes UTF-8", () => {
        expect(validateChangePassword({ currentPassword: "", newPassword: "123" })).toEqual({
            success: false,
            errors: {
                currentPassword: "A senha atual é obrigatória.",
                newPassword: `A nova senha deve possuir pelo menos ${CHANGE_PASSWORD_MIN_LENGTH} caracteres.`,
            },
        });

        const over72Bytes = "🔐".repeat(19);
        const overRes = validateChangePassword({
            currentPassword: "SenhaAtual123",
            newPassword: over72Bytes,
        });
        expect(overRes.success).toBe(false);
        if (!overRes.success) {
            expect(overRes.errors.newPassword).toMatch(
                new RegExp(String(CHANGE_PASSWORD_MAX_BYTES)),
            );
        }
    });

    it("rejeita nova senha igual à senha atual", () => {
        expect(
            validateChangePassword({
                currentPassword: "MesmaSenha123",
                newPassword: "MesmaSenha123",
            }),
        ).toEqual({
            success: false,
            errors: {
                newPassword: "A nova senha deve ser diferente da senha atual.",
            },
        });
    });

    it("aceita payload válido sem alterar caracteres da senha", () => {
        expect(
            validateChangePassword({
                currentPassword: " SenhaAtual123 ",
                newPassword: " NovaSenha456 ",
            }),
        ).toEqual({
            success: true,
            data: {
                currentPassword: " SenhaAtual123 ",
                newPassword: " NovaSenha456 ",
            },
        });
    });
});
