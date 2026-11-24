import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionClient } = vi.hoisted(() => {
    const transactionClient = {
        $queryRaw: vi.fn(),
        round: {
            findUnique: vi.fn(),
        },
        gamePlayer: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        roundAnswer: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    };

    return {
        transactionClient,
        prismaMock: {
            $transaction: vi.fn(
                async (
                    callback: (tx: typeof transactionClient) => Promise<unknown>,
                ) => callback(transactionClient),
            ),
        },
    };
});

vi.mock("../../src/database/prisma.js", () => ({
    prisma: prismaMock,
}));

import {
    calculateRoundAnswerPoints,
    RoundAnswerRepository,
} from "../../src/round-answers/round-answer.repository.js";

describe("RoundAnswerRepository", () => {
    let repository: RoundAnswerRepository;

    const roundFixture = {
        id: "round-test-uuid",
        gameId: "game-test-uuid",
        snapshotQuestionId: "snap-question-1",
        roundNumber: 1,
        status: "OPEN" as const,
        openedAt: new Date("2026-11-18T12:00:00.000Z"),
        closedAt: null,
        timeLimit: 30,
        game: {
            id: "game-test-uuid",
            roomId: "room-test-uuid",
            status: "IN_PROGRESS" as const,
            gameMode: "CLASSIC" as const,
            finishedAt: null,
            room: {
                id: "room-test-uuid",
                status: "ACTIVE" as const,
            },
        },
        snapshotQuestion: {
            id: "snap-question-1",
            options: [
                {
                    id: "option-correct",
                    text: "Correta",
                    isCorrect: true,
                },
                {
                    id: "option-wrong",
                    text: "Errada",
                    isCorrect: false,
                },
            ],
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-18T12:00:15.000Z"));
        repository = new RoundAnswerRepository();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("deve registrar uma resposta correta e atualizar a pontuação do GamePlayer", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
            status: "ACTIVE",
        });
        transactionClient.roundAnswer.findUnique.mockResolvedValue(null);
        const createdAnswer = {
            id: "answer-uuid",
            roundId: roundFixture.id,
            gamePlayerId: "gp-1",
            optionId: "option-correct",
            isCorrect: true,
            answeredAt: new Date("2026-11-18T12:00:15.000Z"),
            points: 150,
        };
        transactionClient.roundAnswer.create.mockResolvedValue(createdAnswer);

        const result = await repository.submitAnswer(
            roundFixture.id,
            "gp-1",
            "option-correct",
        );

        expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith({
            data: {
                roundId: roundFixture.id,
                gamePlayerId: "gp-1",
                optionId: "option-correct",
                isCorrect: true,
                answeredAt: new Date("2026-11-18T12:00:15.000Z"),
                points: 150,
            },
        });
        expect(transactionClient.gamePlayer.update).toHaveBeenCalledWith({
            where: { id: "gp-1" },
            data: {
                score: { increment: 150 },
            },
        });
        expect(result).toEqual({ success: true, answer: createdAnswer });
    });

    it("deve conceder até 200 pontos em acerto imediato e ~100 pontos perto do fim em rodada de 30s", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
            status: "ACTIVE",
        });
        transactionClient.roundAnswer.findUnique.mockResolvedValue(null);

        // Acerto imediato (t = 0s, 30s restantes): 100 base + 100 bônus = 200 pontos
        vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));
        transactionClient.roundAnswer.create.mockResolvedValueOnce({
            id: "ans-immediate",
            points: 200,
        });

        await repository.submitAnswer(
            roundFixture.id,
            "gp-1",
            "option-correct",
        );
        expect(transactionClient.roundAnswer.create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ points: 200 }),
            }),
        );
        expect(transactionClient.gamePlayer.update).toHaveBeenLastCalledWith({
            where: { id: "gp-1" },
            data: { score: { increment: 200 } },
        });

        // Acerto perto do fim (t = 29,9s, 100ms restantes): ~100 pontos
        vi.setSystemTime(new Date("2026-11-18T12:00:29.900Z"));
        transactionClient.roundAnswer.create.mockResolvedValueOnce({
            id: "ans-late",
            points: 100,
        });

        await repository.submitAnswer(
            roundFixture.id,
            "gp-2",
            "option-correct",
        );
        expect(transactionClient.roundAnswer.create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ points: 100 }),
            }),
        );
        expect(transactionClient.gamePlayer.update).toHaveBeenLastCalledWith({
            where: { id: "gp-2" },
            data: { score: { increment: 100 } },
        });
    });

    it("calculateRoundAnswerPoints segue exatamente 100 base + até 100 de velocidade, 0 normal e -30 hardcore", () => {
        const openedAt = new Date("2026-11-18T12:00:00.000Z");
        const expiresAt = new Date("2026-11-18T12:00:30.000Z");

        expect(
            calculateRoundAnswerPoints({
                isCorrect: true,
                gameMode: "CLASSIC",
                openedAt,
                expiresAt,
                answeredAt: openedAt,
            }),
        ).toBe(200);

        expect(
            calculateRoundAnswerPoints({
                isCorrect: true,
                gameMode: "HARDCORE",
                openedAt,
                expiresAt,
                answeredAt: new Date("2026-11-18T12:00:15.000Z"),
            }),
        ).toBe(150);

        expect(
            calculateRoundAnswerPoints({
                isCorrect: true,
                gameMode: "CLASSIC",
                openedAt,
                expiresAt,
                answeredAt: new Date("2026-11-18T12:00:29.950Z"),
            }),
        ).toBe(100);

        expect(
            calculateRoundAnswerPoints({
                isCorrect: false,
                gameMode: "CLASSIC",
                openedAt,
                expiresAt,
                answeredAt: openedAt,
            }),
        ).toBe(0);

        expect(
            calculateRoundAnswerPoints({
                isCorrect: false,
                gameMode: "HARDCORE",
                openedAt,
                expiresAt,
                answeredAt: openedAt,
            }),
        ).toBe(-30);
    });

    it("deve registrar resposta incorreta no modo CLASSIC sem pontuação e descontar 30 no HARDCORE", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
            status: "ACTIVE",
        });
        transactionClient.roundAnswer.findUnique.mockResolvedValue(null);
        transactionClient.roundAnswer.create.mockResolvedValue({
            id: "ans-classic",
            points: 0,
        });

        await repository.submitAnswer(roundFixture.id, "gp-1", "option-wrong");
        expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ points: 0 }),
            }),
        );

        transactionClient.round.findUnique.mockResolvedValue({
            ...roundFixture,
            game: { ...roundFixture.game, gameMode: "HARDCORE" },
        });
        transactionClient.roundAnswer.create.mockResolvedValue({
            id: "ans-hardcore",
            points: -30,
        });

        await repository.submitAnswer(roundFixture.id, "gp-1", "option-wrong");
        expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ points: -30 }),
            }),
        );
        expect(transactionClient.gamePlayer.update).toHaveBeenCalledWith({
            where: { id: "gp-1" },
            data: { score: { increment: -30 } },
        });
    });

    it("deve retornar ROUND_NOT_FOUND quando a rodada não existir", async () => {
        transactionClient.round.findUnique.mockResolvedValue(null);

        const result = await repository.submitAnswer(
            "missing",
            "gp-1",
            "option-correct",
        );

        expect(result).toEqual({
            success: false,
            reason: "ROUND_NOT_FOUND",
        });
    });

    it("deve rejeitar GamePlayer de outra partida (inclusive partida anterior da mesma sala)", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: "other-game-uuid",
        });

        const result = await repository.submitAnswer(
            roundFixture.id,
            "gp-from-game-1",
            "option-correct",
        );

        expect(result).toEqual({
            success: false,
            reason: "PLAYER_NOT_IN_ROOM",
        });
    });

    it("deve rejeitar participante inexistente", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue(null);

        const result = await repository.submitAnswer(
            roundFixture.id,
            "missing-player",
            "option-correct",
        );

        expect(result).toEqual({
            success: false,
            reason: "PLAYER_NOT_IN_ROOM",
        });
    });

    it("deve rejeitar rodada fechada", async () => {
        transactionClient.round.findUnique.mockResolvedValue({
            ...roundFixture,
            status: "CLOSED",
        });
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
            status: "ACTIVE",
        });

        const result = await repository.submitAnswer(
            roundFixture.id,
            "gp-1",
            "option-correct",
        );

        expect(result).toEqual({
            success: false,
            reason: "ROUND_NOT_OPEN",
        });
    });

    it("deve rejeitar partida finalizada, cancelada ou sala arquivada", async () => {
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
            status: "ACTIVE",
        });

        transactionClient.round.findUnique.mockResolvedValueOnce({
            ...roundFixture,
            game: { ...roundFixture.game, status: "FINISHED", finishedAt: new Date() },
        });
        expect(
            await repository.submitAnswer(
                roundFixture.id,
                "gp-1",
                "option-correct",
            ),
        ).toEqual({ success: false, reason: "GAME_NOT_IN_PROGRESS" });

        transactionClient.round.findUnique.mockResolvedValueOnce({
            ...roundFixture,
            game: {
                ...roundFixture.game,
                room: { id: "room-test-uuid", status: "ARCHIVED" },
            },
        });
        expect(
            await repository.submitAnswer(
                roundFixture.id,
                "gp-1",
                "option-correct",
            ),
        ).toEqual({ success: false, reason: "GAME_NOT_IN_PROGRESS" });
    });

    it("deve rejeitar alternativa inválida, duplicada ou com tempo expirado", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
            status: "ACTIVE",
        });

        expect(
            await repository.submitAnswer(
                roundFixture.id,
                "gp-1",
                "option-invalid",
            ),
        ).toEqual({ success: false, reason: "OPTION_NOT_VALID" });

        transactionClient.roundAnswer.findUnique.mockResolvedValueOnce({
            id: "existing",
        });
        expect(
            await repository.submitAnswer(
                roundFixture.id,
                "gp-1",
                "option-correct",
            ),
        ).toEqual({ success: false, reason: "ALREADY_ANSWERED" });

        transactionClient.roundAnswer.findUnique.mockResolvedValueOnce(null);
        vi.setSystemTime(new Date("2026-11-18T12:00:31.000Z"));
        expect(
            await repository.submitAnswer(
                roundFixture.id,
                "gp-1",
                "option-correct",
            ),
        ).toEqual({ success: false, reason: "ROUND_TIME_EXPIRED" });
    });

    it.each(["LEFT", "ABANDONED"] as const)(
        "deve rejeitar envio de resposta para participante com status %s sem registrar resposta ou alterar pontuação",
        async (status) => {
            transactionClient.round.findUnique.mockResolvedValue(roundFixture);
            transactionClient.gamePlayer.findUnique.mockResolvedValue({
                gameId: roundFixture.gameId,
                status,
            });

            const result = await repository.submitAnswer(
                roundFixture.id,
                "gp-inactive",
                "option-correct",
            );

            expect(result).toEqual({
                success: false,
                reason: "PLAYER_INACTIVE",
            });
            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
            expect(transactionClient.gamePlayer.update).not.toHaveBeenCalled();
        },
    );
});
