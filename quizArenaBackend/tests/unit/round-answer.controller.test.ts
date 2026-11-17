
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { RoomPlayer } from "@prisma/client";

import { RoundAnswerController } from "../../src/round-answers/round-answer.controller.js";
import {
    RoundAnswerAlreadySubmittedError,
    RoundAnswerGameNotInProgressError,
    RoundAnswerOptionNotValidError,
    RoundAnswerPlayerNotInRoomError,
    RoundAnswerRoundNotFoundError,
    RoundAnswerRoundNotOpenError,
} from "../../src/round-answers/round-answer.errors.js";
import type { RoundAnswerService } from "../../src/round-answers/round-answer.service.js";

describe("RoundAnswerController", () => {
    let roundAnswerService: {
        submitAnswer: ReturnType<typeof vi.fn>;
    };

    let controller: RoundAnswerController;

    type AuthenticatedRequest = Request & {
        roomPlayer?: RoomPlayer;
    };

    let req: Partial<AuthenticatedRequest>;

    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };

    const roomPlayer = {
        id: "11111111-1111-4111-8111-111111111111",
        roomId: "22222222-2222-4222-8222-222222222222",
    } as RoomPlayer;

    const answerFixture = {
        id: "55555555-5555-4555-8555-555555555555",
        roundId: "33333333-3333-4333-8333-333333333333",
        roomPlayerId: roomPlayer.id,
        optionId: "44444444-4444-4444-8444-444444444444",
        answeredAt: new Date("2026-11-16T19:00:00.000Z"),
        isCorrect: true,
    };

    beforeEach(() => {
        roundAnswerService = {
            submitAnswer: vi.fn(),
        };

        controller = new RoundAnswerController(
            roundAnswerService as unknown as RoundAnswerService,
        );

        req = {
            params: {
                id: "33333333-3333-4333-8333-333333333333",
            },
            body: {
                optionId: "44444444-4444-4444-8444-444444444444",
            },
            roomPlayer,
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("submit", () => {
        it("deve retornar 401 quando não houver participante autenticado", async () => {
            req.roomPlayer = undefined;

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roundAnswerService.submitAnswer).not.toHaveBeenCalled();
        });

        it("deve retornar 400 quando o identificador da rodada for inválido", async () => {
            req.params = {} as Request["params"];

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(roundAnswerService.submitAnswer).not.toHaveBeenCalled();
        });

        it("deve retornar 400 quando a alternativa não for um UUID válido", async () => {
            req.body = {
                optionId: "alternativa-invalida",
            };

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(roundAnswerService.submitAnswer).not.toHaveBeenCalled();
        });

        it("deve registrar a resposta e retornar 201", async () => {
            roundAnswerService.submitAnswer.mockResolvedValue(
                answerFixture,
            );

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(roundAnswerService.submitAnswer).toHaveBeenCalledWith(
                "33333333-3333-4333-8333-333333333333",
                roomPlayer.id,
                "44444444-4444-4444-8444-444444444444",
            );

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                answer: answerFixture,
            });
        });

        it("deve retornar 404 quando a rodada não existir", async () => {
            roundAnswerService.submitAnswer.mockRejectedValue(
                new RoundAnswerRoundNotFoundError(),
            );

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("deve retornar 403 quando o participante não pertencer à sala", async () => {
            roundAnswerService.submitAnswer.mockRejectedValue(
                new RoundAnswerPlayerNotInRoomError(),
            );

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it.each([
            RoundAnswerRoundNotOpenError,
            RoundAnswerGameNotInProgressError,
            RoundAnswerOptionNotValidError,
            RoundAnswerAlreadySubmittedError,
        ])(
            "deve retornar 409 para %s",
            async (ExpectedError) => {
                roundAnswerService.submitAnswer.mockRejectedValue(
                    new ExpectedError(),
                );

                await controller.submit(
                    req as Request,
                    res as unknown as Response,
                );

                expect(res.status).toHaveBeenCalledWith(409);
            },
        );

        it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            roundAnswerService.submitAnswer.mockRejectedValue(
                new Error("Erro inesperado no banco"),
            );

            await controller.submit(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                message: "Erro interno ao registrar resposta.",
            });
            expect(consoleSpy).toHaveBeenCalled();
        });
    });
});
