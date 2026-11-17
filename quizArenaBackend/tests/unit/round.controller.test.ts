
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { RoundController } from "../../src/rounds/round.controller.js";
import {
    RoundRoomNotFoundError,
    RoundAccessDeniedError,
    RoundRoomNotInProgressError,
    RoundGameNotFoundError,
    RoundAlreadyOpenError,
    PreviousRoundNotClosedError,
} from "../../src/rounds/round.errors.js";
import type { RoundService } from "../../src/rounds/round.service.js";

describe("RoundController", () => {
    let roundService: {
        createNextRound: ReturnType<typeof vi.fn>;
    };

    let controller: RoundController;

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

    const roundFixture = {
        id: "round-test-uuid",
        gameId: "game-test-uuid",
        snapshotQuestionId: "snapshot-question-1",
        roundNumber: 1,
        status: "OPEN" as const,
        openedAt: new Date("2026-11-16T12:00:00.000Z"),
        closedAt: null,
        timeLimit: 30,
        snapshotQuestion: {
            id: "snapshot-question-1",
            sourceQuestionId: "source-question-1",
            statement: "Qual é a capital do Brasil?",
            type: "MULTIPLE_CHOICE" as const,
            position: 0,
            snapshotId: "snapshot-test-uuid",
            options: [
                {
                    id: "option-1",
                    sourceOptionId: "source-option-1",
                    questionSnapshotId: "snapshot-question-1",
                    text: "Brasília",
                    isCorrect: true,
                    position: 0,
                },
                {
                    id: "option-2",
                    sourceOptionId: "source-option-2",
                    questionSnapshotId: "snapshot-question-1",
                    text: "São Paulo",
                    isCorrect: false,
                    position: 1,
                },
            ],
        },
    };

    beforeEach(() => {
        roundService = {
            createNextRound: vi.fn(),
        };

        controller = new RoundController(
            roundService as unknown as RoundService,
        );

        req = {
            params: { id: "room-test-uuid" },
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

    describe("createNext", () => {
        it("deve retornar 401 quando não houver usuário autenticado", async () => {
            req.user = undefined as unknown as AuthenticatedRequest["user"];

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roundService.createNextRound).not.toHaveBeenCalled();
        });

        it("deve retornar 400 quando o identificador da sala for inválido", async () => {
            req.params = {} as Request["params"];

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Identificador da sala inválido.",
            });
            expect(roundService.createNextRound).not.toHaveBeenCalled();
        });

        it("deve criar a rodada e retornar a pergunta sem revelar a resposta correta", async () => {
            roundService.createNextRound.mockResolvedValue({
                finished: false,
                round: roundFixture,
            });

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(roundService.createNextRound).toHaveBeenCalledWith(
                "room-test-uuid",
                authenticatedUser.id,
            );

            expect(res.status).toHaveBeenCalledWith(201);

            expect(res.json).toHaveBeenCalledWith({
                finished: false,
                round: {
                    id: "round-test-uuid",
                    roundNumber: 1,
                    status: "OPEN",
                    openedAt: roundFixture.openedAt,
                    timeLimit: 30,
                    question: {
                        id: "snapshot-question-1",
                        statement: "Qual é a capital do Brasil?",
                        type: "MULTIPLE_CHOICE",
                        position: 0,
                        options: [
                            {
                                id: "option-1",
                                text: "Brasília",
                                position: 0,
                            },
                            {
                                id: "option-2",
                                text: "São Paulo",
                                position: 1,
                            },
                        ],
                    },
                },
            });

            const responseBody = res.json.mock.calls[0][0];

            expect(responseBody.round.question.options[0]).not.toHaveProperty(
                "isCorrect",
            );

            expect(JSON.stringify(responseBody)).not.toContain(
                "sourceOptionId",
            );

            expect(JSON.stringify(responseBody)).not.toContain(
                "sourceQuestionId",
            );
        });

        it("deve retornar 200 quando o deck terminar", async () => {
            roundService.createNextRound.mockResolvedValue({
                finished: true,
            });

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                finished: true,
                message:
                    "Todas as perguntas foram utilizadas. A partida foi finalizada.",
            });
        });

        it("deve retornar 404 quando a sala não existir", async () => {
            roundService.createNextRound.mockRejectedValue(
                new RoundRoomNotFoundError(),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Sala não encontrada.",
            });
        });

        it("deve retornar 403 quando o usuário não for o host", async () => {
            roundService.createNextRound.mockRejectedValue(
                new RoundAccessDeniedError(),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("deve retornar 409 quando a sala não estiver em andamento", async () => {
            roundService.createNextRound.mockRejectedValue(
                new RoundRoomNotInProgressError(),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 409 quando a partida não existir", async () => {
            roundService.createNextRound.mockRejectedValue(
                new RoundGameNotFoundError(),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 409 quando já existir uma rodada aberta", async () => {
            roundService.createNextRound.mockRejectedValue(
                new RoundAlreadyOpenError(),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 409 quando a rodada anterior não estiver fechada", async () => {
            roundService.createNextRound.mockRejectedValue(
                new PreviousRoundNotClosedError(),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            roundService.createNextRound.mockRejectedValue(
                new Error("Erro inesperado no banco"),
            );

            await controller.createNext(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                message: "Erro interno ao criar próxima rodada.",
            });
            expect(consoleSpy).toHaveBeenCalled();
        });
    });
});
