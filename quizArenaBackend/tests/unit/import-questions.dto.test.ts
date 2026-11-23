import { QuestionType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
    QUESTION_OPTION_MAX_LENGTH,
    QUESTION_STATEMENT_MAX_LENGTH,
    validateCreateQuestion,
    validateQuestionItem,
} from "../../src/questions/create-question.dto.js";
import {
    MAX_QUESTIONS_PER_IMPORT,
    validateImportQuestions,
} from "../../src/questions/import-questions.dto.js";

describe("validateImportQuestions & regras compartilhadas de questão", () => {
    it("deve aceitar lote válido misturando MULTIPLE_CHOICE (2, 3 e 4 alternativas) e TRUE_FALSE", () => {
        const result = validateImportQuestions({
            questions: [
                {
                    statement: "  Qual é a capital do Brasil?  ",
                    type: QuestionType.MULTIPLE_CHOICE,
                    options: [
                        { text: "  Brasília ", isCorrect: true },
                        { text: "Rio de Janeiro", isCorrect: false },
                    ],
                },
                {
                    statement: "Qual porta padrão do HTTPS?",
                    options: [
                        { text: "80", isCorrect: false },
                        { text: "443", isCorrect: true },
                        { text: "22", isCorrect: false },
                    ],
                },
                {
                    statement: "Qual protocolo garante entrega ordenada?",
                    type: QuestionType.MULTIPLE_CHOICE,
                    options: [
                        { text: "UDP", isCorrect: false },
                        { text: "TCP", isCorrect: true },
                        { text: "ICMP", isCorrect: false },
                        { text: "ARP", isCorrect: false },
                    ],
                },
                {
                    statement: "O protocolo HTTP é stateless.",
                    type: QuestionType.TRUE_FALSE,
                    options: [
                        { text: "Verdadeiro", isCorrect: true },
                        { text: "Falso", isCorrect: false },
                    ],
                },
            ],
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.questions).toHaveLength(4);
            expect(result.data.questions[0]?.statement).toBe(
                "Qual é a capital do Brasil?",
            );
            expect(result.data.questions[1]?.type).toBe(
                QuestionType.MULTIPLE_CHOICE,
            );
            expect(result.data.questions[3]?.type).toBe(
                QuestionType.TRUE_FALSE,
            );
        }
    });

    it("deve rejeitar JSON sem questions ou com lista vazia", () => {
        expect(validateImportQuestions(null).success).toBe(false);
        expect(validateImportQuestions([]).success).toBe(false);

        const missingQuestions = validateImportQuestions({});
        expect(missingQuestions.success).toBe(false);
        if (!missingQuestions.success) {
            expect(missingQuestions.errors).toHaveProperty("questions");
        }

        const emptyQuestions = validateImportQuestions({ questions: [] });
        expect(emptyQuestions.success).toBe(false);
        if (!emptyQuestions.success) {
            expect(emptyQuestions.errors).toHaveProperty("questions");
        }
    });

    it("deve rejeitar lote com mais de 100 questões", () => {
        const questions = Array.from(
            { length: MAX_QUESTIONS_PER_IMPORT + 1 },
            (_, idx) => ({
                statement: `Pergunta ${idx + 1}`,
                type: QuestionType.TRUE_FALSE,
                options: [
                    { text: "Verdadeiro", isCorrect: true },
                    { text: "Falso", isCorrect: false },
                ],
            }),
        );

        const result = validateImportQuestions({ questions });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.questions).toMatch(/100/);
        }
    });

    it("deve rejeitar enunciado vazio ou acima de 300 caracteres e alternativa acima de 120 caracteres", () => {
        const longStatement = "a".repeat(QUESTION_STATEMENT_MAX_LENGTH + 1);
        const longOption = "b".repeat(QUESTION_OPTION_MAX_LENGTH + 1);

        const resStatement = validateImportQuestions({
            questions: [
                {
                    statement: longStatement,
                    options: [
                        { text: "Opção 1", isCorrect: true },
                        { text: "Opção 2", isCorrect: false },
                    ],
                },
            ],
        });
        expect(resStatement.success).toBe(false);
        if (!resStatement.success) {
            expect(resStatement.errors["questions[0].statement"]).toMatch(
                /300/,
            );
        }

        const resOption = validateImportQuestions({
            questions: [
                {
                    statement: "Pergunta válida",
                    options: [
                        { text: longOption, isCorrect: true },
                        { text: "Opção 2", isCorrect: false },
                    ],
                },
            ],
        });
        expect(resOption.success).toBe(false);
        if (!resOption.success) {
            expect(resOption.errors["questions[0].options"]).toMatch(/120/);
        }
    });

    it("deve rejeitar alternativas duplicadas (trim + case-insensitive) tanto no lote quanto na validação individual", () => {
        const duplicateOptionsQuestion = {
            roomId: "room-1",
            statement: "Qual é a opção correta?",
            type: QuestionType.MULTIPLE_CHOICE,
            options: [
                { text: "  Brasília ", isCorrect: true },
                { text: "brasília", isCorrect: false },
            ],
        };

        const singleResult = validateCreateQuestion(duplicateOptionsQuestion);
        expect(singleResult.success).toBe(false);
        if (!singleResult.success) {
            expect(singleResult.errors).toHaveProperty("options");
        }

        const batchResult = validateImportQuestions({
            questions: [duplicateOptionsQuestion],
        });
        expect(batchResult.success).toBe(false);
        if (!batchResult.success) {
            expect(batchResult.errors["questions[0].options"]).toBeDefined();
        }
    });

    it("deve rejeitar enunciados duplicados no mesmo arquivo (trim + case-insensitive)", () => {
        const result = validateImportQuestions({
            questions: [
                {
                    statement: "Qual a capital da França?",
                    options: [
                        { text: "Paris", isCorrect: true },
                        { text: "Lyon", isCorrect: false },
                    ],
                },
                {
                    statement: "  qual a capital da frança? ",
                    options: [
                        { text: "Paris", isCorrect: true },
                        { text: "Marselha", isCorrect: false },
                    ],
                },
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors["questions[1].statement"]).toMatch(
                /duplicado/i,
            );
        }
    });

    it('deve rejeitar TRUE_FALSE sem exatamente 2 opções padronizadas "Verdadeiro" e "Falso" ou com número inválido de corretas', () => {
        const invalidTexts = validateImportQuestions({
            questions: [
                {
                    statement: "Afirmação 1",
                    type: QuestionType.TRUE_FALSE,
                    options: [
                        { text: "Sim", isCorrect: true },
                        { text: "Não", isCorrect: false },
                    ],
                },
            ],
        });
        expect(invalidTexts.success).toBe(false);
        if (!invalidTexts.success) {
            expect(invalidTexts.errors["questions[0].options"]).toMatch(
                /Verdadeiro.*Falso/,
            );
        }

        const twoCorrect = validateQuestionItem({
            statement: "Afirmação 2",
            type: QuestionType.TRUE_FALSE,
            options: [
                { text: "Verdadeiro", isCorrect: true },
                { text: "Falso", isCorrect: true },
            ],
        });
        expect(twoCorrect.success).toBe(false);

        const zeroCorrect = validateQuestionItem({
            statement: "Afirmação 3",
            type: QuestionType.TRUE_FALSE,
            options: [
                { text: "Verdadeiro", isCorrect: false },
                { text: "Falso", isCorrect: false },
            ],
        });
        expect(zeroCorrect.success).toBe(false);
    });
});
