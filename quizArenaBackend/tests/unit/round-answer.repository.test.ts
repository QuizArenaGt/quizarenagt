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

import { RoundAnswerRepository } from "../../src/round-answers/round-answer.repository.js";

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
        });
        transactionClient.roundAnswer.findUnique.mockResolvedValue(null);
        const createdAnswer = {
            id: "answer-uuid",
            roundId: roundFixture.id,
            gamePlayerId: "gp-1",
            optionId: "option-correct",
            isCorrect: true,
            answeredAt: new Date("2026-11-18T12:00:15.000Z"),
            points: 125,
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
                points: 125,
            },
        });
        expect(transactionClient.gamePlayer.update).toHaveBeenCalledWith({
            where: { id: "gp-1" },
            data: {
                score: { increment: 125 },
            },
        });
        expect(result).toEqual({ success: true, answer: createdAnswer });
    });

    it("deve registrar resposta incorreta no modo CLASSIC sem pontuação e descontar 30 no HARDCORE", async () => {
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.gamePlayer.findUnique.mockResolvedValue({
            gameId: roundFixture.gameId,
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
});
