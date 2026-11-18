
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoundRepository } from "../../src/rounds/round.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        $transaction: vi.fn(),
    },
}));

const transactionClient = {
    $queryRaw: vi.fn(),
    room: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    game: {
        update: vi.fn(),
    },
    round: {
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

const roomFixture = {
    id: "room-test-uuid",
    hostId: "host-test-uuid",
    status: "IN_PROGRESS",
    questionTime: 30,
    questionSnapshot: {
        id: "snapshot-test-uuid",
        questions: Array.from({ length: 5 }, (_, index) => ({
            id: `snapshot-question-${index + 1}`,
            statement: `Pergunta ${index + 1}`,
            type: "MULTIPLE_CHOICE",
            position: index,
        })),
    },
    game: {
        id: "game-test-uuid",
        rounds: [],
    },
};

const roundFixture = {
    id: "round-test-uuid",
    gameId: "game-test-uuid",
    snapshotQuestionId: "snapshot-question-1",
    roundNumber: 1,
    status: "OPEN",
    openedAt: new Date("2026-11-16T12:00:00.000Z"),
    closedAt: null,
    timeLimit: 30,
    snapshotQuestion: {
        id: "snapshot-question-1",
        statement: "Pergunta 1",
        type: "MULTIPLE_CHOICE",
        position: 0,
        options: [
            {
                id: "option-1",
                text: "Alternativa 1",
                isCorrect: true,
                position: 0,
            },
            {
                id: "option-2",
                text: "Alternativa 2",
                isCorrect: false,
                position: 1,
            },
        ],
    },
};

describe("RoundRepository", () => {
    let repository: RoundRepository;

    beforeEach(() => {
        vi.clearAllMocks();

        transactionMock.mockImplementation(
            (callback: TransactionCallback) =>
                callback(transactionClient),
        );

        transactionClient.$queryRaw.mockResolvedValue([]);

        transactionClient.room.findUnique.mockResolvedValue(roomFixture);

        transactionClient.round.create.mockResolvedValue(roundFixture);

        transactionClient.game.update.mockResolvedValue({
            id: "game-test-uuid",
            finishedAt: new Date(),
        });

        transactionClient.room.update.mockResolvedValue({
            ...roomFixture,
            status: "FINISHED",
        });

        repository = new RoundRepository();
    });

    describe("createNextRound", () => {
        it("deve criar a primeira rodada usando a primeira pergunta do snapshot", async () => {
            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionMock).toHaveBeenCalled();
            expect(transactionClient.$queryRaw).toHaveBeenCalled();

            expect(transactionClient.room.findUnique).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                include: {
                    questionSnapshot: {
                        include: {
                            questions: {
                                orderBy: {
                                    position: "asc",
                                },
                            },
                        },
                    },
                    game: {
                        include: {
                            rounds: {
                                orderBy: {
                                    roundNumber: "desc",
                                },
                                take: 1,
                            },
                        },
                    },
                },
            });

            expect(transactionClient.round.create).toHaveBeenCalledWith({
                data: {
                    gameId: "game-test-uuid",
                    snapshotQuestionId: "snapshot-question-1",
                    roundNumber: 1,
                    timeLimit: 30,
                },
                include: {
                    snapshotQuestion: {
                        include: {
                            options: {
                                orderBy: {
                                    position: "asc",
                                },
                            },
                        },
                    },
                },
            });

            expect(result).toEqual({
                success: true,
                round: roundFixture,
            });
        });

        it("deve criar a próxima rodada após o encerramento da anterior", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                game: {
                    ...roomFixture.game,
                    rounds: [
                        {
                            id: "previous-round-uuid",
                            roundNumber: 1,
                            status: "CLOSED",
                        },
                    ],
                },
            });

            transactionClient.round.create.mockResolvedValue({
                ...roundFixture,
                snapshotQuestionId: "snapshot-question-2",
                roundNumber: 2,
                snapshotQuestion: {
                    ...roundFixture.snapshotQuestion,
                    id: "snapshot-question-2",
                    statement: "Pergunta 2",
                    position: 1,
                },
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionClient.round.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        gameId: "game-test-uuid",
                        snapshotQuestionId: "snapshot-question-2",
                        roundNumber: 2,
                        timeLimit: 30,
                    },
                }),
            );

            expect(result).toMatchObject({
                success: true,
                round: {
                    roundNumber: 2,
                    snapshotQuestionId: "snapshot-question-2",
                },
            });
        });

        it("deve retornar ROOM_NOT_FOUND quando a sala não existir", async () => {
            transactionClient.room.findUnique.mockResolvedValue(null);

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });

        it("deve retornar ACCESS_DENIED quando o usuário não for o host", async () => {
            const result = await repository.createNextRound(
                roomFixture.id,
                "other-user-id",
            );

            expect(result).toEqual({
                success: false,
                reason: "ACCESS_DENIED",
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });

        it("deve retornar ROOM_NOT_IN_PROGRESS quando a sala não estiver em andamento", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                status: "WAITING",
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_NOT_IN_PROGRESS",
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });

        it("deve retornar GAME_NOT_FOUND quando a partida não existir", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                game: null,
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "GAME_NOT_FOUND",
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });

        it("deve impedir a criação quando já existir uma rodada aberta", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                game: {
                    ...roomFixture.game,
                    rounds: [
                        {
                            id: "previous-round-uuid",
                            roundNumber: 1,
                            status: "OPEN",
                        },
                    ],
                },
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROUND_ALREADY_OPEN",
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });

        it("deve impedir a criação quando a rodada anterior não estiver fechada", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                game: {
                    ...roomFixture.game,
                    rounds: [
                        {
                            id: "previous-round-uuid",
                            roundNumber: 1,
                            status: "UNKNOWN",
                        },
                    ],
                },
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "PREVIOUS_ROUND_NOT_CLOSED",
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });

        it("deve finalizar a partida quando todas as perguntas forem utilizadas", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                game: {
                    ...roomFixture.game,
                    rounds: [
                        {
                            id: "last-round-uuid",
                            roundNumber: 5,
                            status: "CLOSED",
                        },
                    ],
                },
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "DECK_FINISHED",
            });

            expect(transactionClient.game.update).toHaveBeenCalledWith({
                where: { id: "game-test-uuid" },
                data: {
                    finishedAt: expect.any(Date),
                },
            });

            expect(transactionClient.room.update).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                data: {
                    status: "FINISHED",
                },
            });

            expect(transactionClient.round.create).not.toHaveBeenCalled();
        });
    });
});
