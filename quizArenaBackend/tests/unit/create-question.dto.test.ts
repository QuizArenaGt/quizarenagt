import { describe, expect, it } from "vitest";
import { QuestionType } from "@prisma/client";
import { validateCreateQuestion } from "../../src/questions/create-question.dto.js";

const validOptions = [
    { text: "Brasília", isCorrect: true },
    { text: "São Paulo", isCorrect: false },
    { text: "Rio de Janeiro", isCorrect: false },
    { text: "Salvador", isCorrect: false },
];

const validRoomId = "room-test-uuid";

describe("validateCreateQuestion", () => {
    it("deve aceitar dados válidos de criação de pergunta", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            type: QuestionType.MULTIPLE_CHOICE,
            options: validOptions,
            roomId: validRoomId,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toEqual({
                roomId: validRoomId,
                statement: "Qual é a capital do Brasil?",
                type: QuestionType.MULTIPLE_CHOICE,
                options: validOptions,
            });
        }
    });

    it("deve definir MULTIPLE_CHOICE como tipo padrão quando type não for informado", () => {
        const result = validateCreateQuestion({
            statement: "  Qual é a capital do Brasil?  ",
            options: validOptions,
            roomId: validRoomId,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data.statement).toBe("Qual é a capital do Brasil?");
            expect(result.data.type).toBe(QuestionType.MULTIPLE_CHOICE);
            expect(result.data.roomId).toBe(validRoomId);
        }
    });

    it.each([null, [], "texto", 123, undefined])(
        "deve rejeitar corpo inválido: %s",
        (body) => {
            const result = validateCreateQuestion(body);
            expect(result.success).toBe(false);
        },
    );

    it("deve rejeitar enunciado ausente ou vazio", () => {
        const resultEmpty = validateCreateQuestion({
            statement: "   ",
            options: validOptions,
        });

        expect(resultEmpty.success).toBe(false);
        if (!resultEmpty.success) {
            expect(resultEmpty.errors).toHaveProperty("statement");
        }

        const resultMissing = validateCreateQuestion({
            options: validOptions,
        });

        expect(resultMissing.success).toBe(false);
        if (!resultMissing.success) {
            expect(resultMissing.errors).toHaveProperty("statement");
        }
    });

    it("deve rejeitar tipo de pergunta inválido", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            type: "TIPO_INVALIDO",
            options: validOptions,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toHaveProperty("type");
        }
    });

    it("deve rejeitar quando options não for um array", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: "invalido",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toHaveProperty("options");
        }
    });

    it("deve rejeitar quando o número de alternativas for menor que 4", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: validOptions.slice(0, 3),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toHaveProperty("options");
        }
    });

    it("deve rejeitar quando o número de alternativas for maior que 4", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: [
                ...validOptions,
                { text: "Belo Horizonte", isCorrect: false },
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toHaveProperty("options");
        }
    });

    it("deve rejeitar quando nenhuma alternativa estiver marcada como correta", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: [
                { text: "Brasília", isCorrect: false },
                { text: "São Paulo", isCorrect: false },
                { text: "Rio de Janeiro", isCorrect: false },
                { text: "Salvador", isCorrect: false },
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toHaveProperty("options");
        }
    });

    it("deve rejeitar quando houver mais de 1 alternativa correta", () => {
        const result = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: [
                { text: "Brasília", isCorrect: true },
                { text: "São Paulo", isCorrect: true },
                { text: "Rio de Janeiro", isCorrect: false },
                { text: "Salvador", isCorrect: false },
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toHaveProperty("options");
        }
    });

    it("deve rejeitar quando alguma alternativa tiver texto vazio ou formato inválido", () => {
        const resultEmptyText = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: [
                { text: "Brasília", isCorrect: true },
                { text: "   ", isCorrect: false },
                { text: "Rio de Janeiro", isCorrect: false },
                { text: "Salvador", isCorrect: false },
            ],
        });

        expect(resultEmptyText.success).toBe(false);

        const resultInvalidBoolean = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: [
                { text: "Brasília", isCorrect: "sim" },
                { text: "São Paulo", isCorrect: false },
                { text: "Rio de Janeiro", isCorrect: false },
                { text: "Salvador", isCorrect: false },
            ],
        });

        expect(resultInvalidBoolean.success).toBe(false);

        const resultNonObjectOption = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: [
                null,
                { text: "São Paulo", isCorrect: false },
                { text: "Rio de Janeiro", isCorrect: false },
                { text: "Salvador", isCorrect: false },
            ],
        });

        expect(resultNonObjectOption.success).toBe(false);
    });

    it("deve rejeitar roomId ausente ou vazio", () => {
        const resultEmpty = validateCreateQuestion({
            roomId: "   ",
            statement: "Qual é a capital do Brasil?",
            options: validOptions,
        });

        expect(resultEmpty.success).toBe(false);

        if (!resultEmpty.success) {
            expect(resultEmpty.errors).toHaveProperty("roomId");
        }

        const resultMissing = validateCreateQuestion({
            statement: "Qual é a capital do Brasil?",
            options: validOptions,
        });

        expect(resultMissing.success).toBe(false);

        if (!resultMissing.success) {
            expect(resultMissing.errors).toHaveProperty("roomId");
        }
    });
});
