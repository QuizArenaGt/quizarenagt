
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
    game: {
        id: "game-test-uuid",
        roomId: "room-test-uuid",
        finishedAt: null,
        room: {
            id: "room-test-uuid",
            status: "IN_PROGRESS",
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

const answerFixture = {
    id: "answer-test-uuid",
    roundId: "round-test-uuid",
    roomPlayerId: "player-test-uuid",
    optionId: "option-correct-uuid",
    answeredAt: new Date("2026-11-16T19:00:00.000Z"),
    isCorrect: true,
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
        transactionClient.roundAnswer.findUnique.mockResolvedValue(null);
        transactionClient.roundAnswer.create.mockResolvedValue(answerFixture);

        repository = new RoundAnswerRepository();
    });

    describe("submitAnswer", () => {
        it("deve registrar uma resposta correta", async () => {
            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-correct-uuid",
            );

            expect(transactionMock).toHaveBeenCalled();
            expect(transactionClient.$queryRaw).toHaveBeenCalled();

            expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith({
                data: {
                    roundId: "round-test-uuid",
                    roomPlayerId: "player-test-uuid",
                    optionId: "option-correct-uuid",
                    isCorrect: true,
                },
            });

            expect(result).toEqual({
                success: true,
                answer: answerFixture,
            });
        });

        it("deve registrar uma resposta incorreta", async () => {
            transactionClient.roundAnswer.create.mockResolvedValue({
                ...answerFixture,
                optionId: "option-wrong-uuid",
                isCorrect: false,
            });

            const result = await repository.submitAnswer(
                "round-test-uuid",
                "player-test-uuid",
                "option-wrong-uuid",
            );

            expect(transactionClient.roundAnswer.create).toHaveBeenCalledWith({
                data: {
                    roundId: "round-test-uuid",
                    roomPlayerId: "player-test-uuid",
                    optionId: "option-wrong-uuid",
                    isCorrect: false,
                },
            });

            expect(result).toMatchObject({
                success: true,
                answer: {
                    isCorrect: false,
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
            transactionClient.roundAnswer.findUnique.mockResolvedValue(
                answerFixture,
            );

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
    });
});
