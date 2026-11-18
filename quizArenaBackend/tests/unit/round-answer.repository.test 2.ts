
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoundAnswerRepository } from "../../src/round-answers/round-answer.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        $transaction: vi.fn(),
    },
}));

const transactionClient = {
    $queryRaw: vi.fn(),
    round: {
        findUnique: vi.fn(),
    },
    roomPlayer: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    roundAnswer: {
        findUnique: vi.fn(),
        create: vi.fn(),
    },
};

type TransactionCallback = (
    tx: typeof transactionClient,
) => Promise<unknown>;

const transactionMock = (
    prisma as unknown as {
        $transaction: ReturnType<typeof vi.fn>;
    }
).$transaction;

const roundFixture = {
    id: "round-test-uuid",
    status: "OPEN",
    openedAt: new Date(Date.now() - 1000),
    timeLimit: 60,
    game: {
        id: "game-test-uuid",
        roomId: "room-test-uuid",
        finishedAt: null,
        room: {
            id: "room-test-uuid",
            status: "IN_PROGRESS",
            gameMode: "CLASSIC",
        },
    },
    snapshotQuestion: {
        id: "snapshot-question-uuid",
        options: [
            {
                id: "option-correct-uuid",
                text: "Correta",
                isCorrect: true,
            },
            {
                id: "option-wrong-uuid",
                text: "Incorreta",
                isCorrect: false,
            },
        ],
    },
};

const playerFixture = {
    roomId: "room-test-uuid",
};

describe("RoundAnswerRepository", () => {
    let repository: RoundAnswerRepository;

    beforeEach(() => {
        vi.clearAllMocks();

        transactionMock.mockImplementation(
            (callback: TransactionCallback) =>
                callback(transactionClient),
        );

        transactionClient.$queryRaw.mockResolvedValue([]);
        transactionClient.round.findUnique.mockResolvedValue(roundFixture);
        transactionClient.roomPlayer.findUnique.mockResolvedValue(playerFixture);
        transactionClient.roomPlayer.update.mockResolvedValue({});
        transactionClient.roundAnswer.findUnique.mockResolvedValue(null);

        transactionClient.roundAnswer.create.mockImplementation(
            async ({ data }: { data: Record<string, unknown> }) => ({
                id: "answer-test-uuid",
                ...data,
            }),
        );

        repository = new RoundAnswerRepository();
    });

    describe("submitAnswer", () => {
        it("deve registrar uma resposta correta e atualizar a pontuação", async () => {
            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(transactionMock).toHaveBeenCalled();
            expect(transactionClient.$queryRaw).toHaveBeenCalled();

            expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    roundId: "round-test-uuid",
                    roomPlayerId: "player-test-uuid",
                    optionId: "option-correct-uuid",
                    isCorrect: true,
                    answeredAt: expect.any(Date),
                    points: expect.any(Number),
                }),
            });

            const createdAnswer =
                transactionClient.roundAnswer.create.mock.calls[0][0].data;

            expect(createdAnswer.points).toBeGreaterThanOrEqual(100);
            expect(createdAnswer.points).toBeLessThanOrEqual(150);

            expect(transactionClient.roomPlayer.update).toHaveBeenCalledWith({
                where: {
                    id: "player-test-uuid",
                },
                data: {
                    score: {
                        increment: createdAnswer.points,
                    },
                },
            });

            expect(result).toEqual({
                success: true,
                answer: {
                    id: "answer-test-uuid",
                    ...createdAnswer,
                },
            });
        });

        it("deve registrar uma resposta incorreta no modo CLASSIC sem pontuação", async () => {
            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-wrong-uuid",
            );

            expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    roundId: "round-test-uuid",
                    roomPlayerId: "player-test-uuid",
                    optionId: "option-wrong-uuid",
                    isCorrect: false,
                    points: 0,
                }),
            });

            expect(transactionClient.roomPlayer.update).toHaveBeenCalledWith({
                where: {
                    id: "player-test-uuid",
                },
                data: {
                    score: {
                        increment: 0,
                    },
                },
            });

            expect(result).toMatchObject({
                success: true,
                answer: {
                    isCorrect: false,
                    points: 0,
                },
            });
        });

        it("deve descontar 30 pontos por uma resposta incorreta no modo HARDCORE", async () => {
            transactionClient.round.findUnique.mockResolvedValue({
                ...roundFixture,
                game: {
                    ...roundFixture.game,
                    room: {
                        ...roundFixture.game.room,
                        gameMode: "HARDCORE",
                    },
                },
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-wrong-uuid",
            );

            expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    isCorrect: false,
                    points: -30,
                }),
            });

            expect(transactionClient.roomPlayer.update).toHaveBeenCalledWith({
                where: {
                    id: "player-test-uuid",
                },
                data: {
                    score: {
                        increment: -30,
                    },
                },
            });

            expect(result).toMatchObject({
                success: true,
                answer: {
                    isCorrect: false,
                    points: -30,
                },
            });
        });

        it("deve retornar ROUND_NOT_FOUND quando a rodada não existir", async () => {
            transactionClient.round.findUnique.mockResolvedValue(null);

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "ROUND_NOT_FOUND",
            });

            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
            expect(transactionClient.roomPlayer.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar um participante que não pertence à sala", async () => {
            transactionClient.roomPlayer.findUnique.mockResolvedValue({
                roomId: "another-room-uuid",
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "PLAYER_NOT_IN_ROOM",
            });

            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar um participante inexistente", async () => {
            transactionClient.roomPlayer.findUnique.mockResolvedValue(null);

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "PLAYER_NOT_IN_ROOM",
            });
        });

        it("deve rejeitar uma rodada fechada", async () => {
            transactionClient.round.findUnique.mockResolvedValue({
                ...roundFixture,
                status: "CLOSED",
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "ROUND_NOT_OPEN",
            });

            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar uma sala que não esteja em andamento", async () => {
            transactionClient.round.findUnique.mockResolvedValue({
                ...roundFixture,
                game: {
                    ...roundFixture.game,
                    room: {
                        ...roundFixture.game.room,
                        status: "FINISHED",
                    },
                },
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "GAME_NOT_IN_PROGRESS",
            });
        });

        it("deve rejeitar uma partida finalizada", async () => {
            transactionClient.round.findUnique.mockResolvedValue({
                ...roundFixture,
                game: {
                    ...roundFixture.game,
                    finishedAt: new Date(),
                },
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "GAME_NOT_IN_PROGRESS",
            });
        });

        it("deve rejeitar uma alternativa que não pertence à pergunta da rodada", async () => {
            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-from-another-question",
            );

            expect(result).toEqual({
                success: false,
                reason: "OPTION_NOT_VALID",
            });

            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar uma segunda resposta do mesmo participante", async () => {
            transactionClient.roundAnswer.findUnique.mockResolvedValue({
                id: "existing-answer-uuid",
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "ALREADY_ANSWERED",
            });

            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar uma resposta enviada após o tempo da rodada", async () => {
            transactionClient.round.findUnique.mockResolvedValue({
                ...roundFixture,
                openedAt: new Date(Date.now() - 61_000),
                timeLimit: 60,
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(result).toEqual({
                success: false,
                reason: "ROUND_TIME_EXPIRED",
            });

            expect(transactionClient.roundAnswer.create).not.toHaveBeenCalled();
            expect(transactionClient.roomPlayer.update).not.toHaveBeenCalled();
        });
    });
});
