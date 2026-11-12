import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { QuestionType } from "@prisma/client";

import { QuestionController } from "../../src/questions/question.controller.js";
import { InvalidQuestionDataError } from "../../src/questions/question.errors.js";
import type { QuestionService } from "../../src/questions/question.service.js";

describe("QuestionController", () => {
    let questionService: {
        createQuestion: ReturnType<typeof vi.fn>;
    };
    let controller: QuestionController;
    let req: Partial<Request>;
    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };

    const validBody = {
        statement: "Qual é a capital do Brasil?",
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Brasília", isCorrect: true },
            { text: "São Paulo", isCorrect: false },
            { text: "Rio de Janeiro", isCorrect: false },
            { text: "Salvador", isCorrect: false },
        ],
    };

    beforeEach(() => {
        questionService = {
            createQuestion: vi.fn(),
        };

        controller = new QuestionController(
            questionService as unknown as QuestionService,
        );

        req = {
            body: validBody,
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("deve retornar 400 quando o payload for inválido", async () => {
        req.body = {
            statement: "",
            options: [],
        };

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Dados inválidos.",
                errors: expect.any(Object),
            }),
        );
        expect(questionService.createQuestion).not.toHaveBeenCalled();
    });

    it("deve criar uma pergunta e retornar 201", async () => {
        const createdQuestion = {
            id: "question-123",
            statement: validBody.statement,
            type: validBody.type,
            isActive: true,
            createdAt: new Date("2026-11-12T12:00:00.000Z"),
            updatedAt: new Date("2026-11-12T12:00:00.000Z"),
            options: validBody.options.map((opt, idx) => ({
                id: `opt-${idx + 1}`,
                text: opt.text,
                isCorrect: opt.isCorrect,
                questionId: "question-123",
            })),
        };

        questionService.createQuestion.mockResolvedValue(createdQuestion);

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(questionService.createQuestion).toHaveBeenCalledWith(validBody);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(createdQuestion);
    });

    it("deve retornar 400 quando o service lançar InvalidQuestionDataError", async () => {
        questionService.createQuestion.mockRejectedValue(
            new InvalidQuestionDataError("Dados inválidos.", {
                options: "Erro nas opções.",
            }),
        );

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Dados inválidos.",
            errors: { options: "Erro nas opções." },
        });
    });

    it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        questionService.createQuestion.mockRejectedValue(
            new Error("Erro inesperado no banco"),
        );

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: "Erro interno ao criar pergunta.",
        });
        expect(consoleSpy).toHaveBeenCalled();
    });
});
