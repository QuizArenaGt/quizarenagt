
import { describe, expect, it } from "vitest";

import {
    validateSubmitRoundAnswer,
} from "../../src/round-answers/submit-round-answer.dto.js";

describe("validateSubmitRoundAnswer", () => {
    it("deve aceitar um optionId válido", () => {
        const result = validateSubmitRoundAnswer({
            optionId: "550e8400-e29b-41d4-a716-446655440000",
        });

        expect(result).toEqual({
            success: true,
            data: {
                optionId: "550e8400-e29b-41d4-a716-446655440000",
            },
        });
    });

    it("deve rejeitar um body que não seja objeto", () => {
        const result = validateSubmitRoundAnswer(null);

        expect(result).toEqual({
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto.",
            },
        });
    });

    it("deve rejeitar um array como body", () => {
        const result = validateSubmitRoundAnswer([]);

        expect(result.success).toBe(false);
    });

    it("deve rejeitar quando optionId estiver ausente", () => {
        const result = validateSubmitRoundAnswer({});

        expect(result).toEqual({
            success: false,
            errors: {
                optionId: "O identificador da alternativa deve ser um UUID válido.",
            },
        });
    });

    it("deve rejeitar um optionId que não seja UUID", () => {
        const result = validateSubmitRoundAnswer({
            optionId: "option-123",
        });

        expect(result.success).toBe(false);
    });

    it("deve rejeitar um optionId vazio", () => {
        const result = validateSubmitRoundAnswer({
            optionId: "   ",
        });

        expect(result.success).toBe(false);
    });

    it("deve remover espaços externos do optionId", () => {
        const result = validateSubmitRoundAnswer({
            optionId: "  550e8400-e29b-41d4-a716-446655440000  ",
        });

        expect(result).toMatchObject({
            success: true,
            data: {
                optionId: "550e8400-e29b-41d4-a716-446655440000",
            },
        });
    });
});
