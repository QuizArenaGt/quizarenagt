
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { QuestionType } from "@prisma/client";

import { QuestionController } from "../../src/questions/question.controller.js";
import {
    InvalidQuestionDataError,
    QuestionRoomAccessDeniedError,
    QuestionRoomNotFoundError,
} from "../../src/questions/question.errors.js";
import type { QuestionService } from "../../src/questions/question.service.js";

describe("QuestionController", () => {
    let questionService: {
        createQuestion: ReturnType<typeof vi.fn>;
    };
    let controller: QuestionController;
    type AuthenticatedRequest = Request & {
        user: {
            id: string;
            role: "HOST";
        };
    };

    let req: Partial<AuthenticatedRequest>;
    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };

    const authenticatedUser = {
        id: "authenticated-host-uuid",
        role: "HOST" as const,
    };

    const validBody = {
        roomId: "room-test-uuid",
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
            user: authenticatedUser,
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("deve retornar 401 quando não houver usuário autenticado", async () => {
        req.user = undefined as unknown as AuthenticatedRequest["user"];

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            message: "Autenticação necessária.",
        });
        expect(questionService.createQuestion).not.toHaveBeenCalled();
    });

    it("deve criar uma pergunta e retornar 201", async () => {
        const createdQuestion = {
            id: "question-123",
            roomId: validBody.roomId,
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

        expect(questionService.createQuestion).toHaveBeenCalledWith({
            ...validBody,
            hostId: authenticatedUser.id,
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(createdQuestion);
    });

    it("deve utilizar o ID do usuário autenticado, ignorando hostId enviado no body", async () => {
        req.body = {
            ...validBody,
            hostId: "fake-host-uuid",
        };

        questionService.createQuestion.mockResolvedValue({});

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(questionService.createQuestion).toHaveBeenCalledWith({
            ...validBody,
            hostId: authenticatedUser.id,
        });
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

    it("deve retornar 404 quando a sala não existir", async () => {
        questionService.createQuestion.mockRejectedValue(
            new QuestionRoomNotFoundError(),
        );

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            message: "Sala não encontrada.",
        });
    });

    it("deve retornar 403 quando o usuário não for o host da sala", async () => {
        questionService.createQuestion.mockRejectedValue(
            new QuestionRoomAccessDeniedError(),
        );

        await controller.create(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            message: "Você não tem permissão para adicionar perguntas nesta sala.",
        });
    });

    it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => { });

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
