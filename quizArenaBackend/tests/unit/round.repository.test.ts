import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionClient } = vi.hoisted(() => {
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
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
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

import { RoundRepository } from "../../src/rounds/round.repository.js";

describe("RoundRepository", () => {
    let repository: RoundRepository;

    const baseDate = new Date("2026-11-18T12:00:00.000Z");

    const snapshotQuestionsFixture = [
        {
            id: "snap-q-1",
            snapshotId: "snapshot-uuid",
            sourceQuestionId: "src-q-1",
            statement: "Pergunta 1?",
            type: "MULTIPLE_CHOICE" as const,
            position: 0,
        },
        {
            id: "snap-q-2",
            snapshotId: "snapshot-uuid",
            sourceQuestionId: "src-q-2",
            statement: "Pergunta 2?",
            type: "MULTIPLE_CHOICE" as const,
            position: 1,
        },
    ];

    const gameFixture = {
        id: "game-test-uuid",
        roomId: "room-test-uuid",
        status: "IN_PROGRESS" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        startedAt: baseDate,
        finishedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        questionSnapshot: {
            id: "snapshot-uuid",
            gameId: "game-test-uuid",
            createdAt: baseDate,
            questions: snapshotQuestionsFixture,
        },
        rounds: [] as Array<{
            id: string;
            gameId: string;
            snapshotQuestionId: string;
            roundNumber: number;
            status: "OPEN" | "CLOSED";
            openedAt: Date;
            closedAt: Date | null;
            timeLimit: number;
        }>,
    };

    const roomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        hostId: "user-host-uuid",
        status: "ACTIVE" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        archivedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        games: [gameFixture],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new RoundRepository();
    });

    describe("createNextRound", () => {
        it("deve criar a primeira rodada usando a primeira pergunta do snapshot do Game", async () => {
            transactionClient.room.findUnique.mockResolvedValue(roomFixture);
            const createdRound = {
                id: "round-1",
                gameId: gameFixture.id,
                snapshotQuestionId: "snap-q-1",
                roundNumber: 1,
                status: "OPEN",
                openedAt: baseDate,
                closedAt: null,
                timeLimit: 30,
                snapshotQuestion: {
                    ...snapshotQuestionsFixture[0],
                    options: [],
                },
            };
            transactionClient.round.create.mockResolvedValue(createdRound);

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionClient.$queryRaw).toHaveBeenCalled();
            expect(transactionClient.round.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        gameId: gameFixture.id,
                        snapshotQuestionId: "snap-q-1",
                        roundNumber: 1,
                        openedAt: expect.any(Date),
                        expiresAt: expect.any(Date),
                        timeLimit: 30,
                    },
                }),
            );
            expect(result).toEqual({
                success: true,
                round: createdRound,
            });
        });

        it("deve criar a próxima rodada após o encerramento da anterior", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [
                    {
                        ...gameFixture,
                        rounds: [
                            {
                                id: "round-1",
                                gameId: gameFixture.id,
                                snapshotQuestionId: "snap-q-1",
                                roundNumber: 1,
                                status: "CLOSED",
                                openedAt: baseDate,
                                closedAt: baseDate,
                                timeLimit: 30,
                            },
                        ],
                    },
                ],
            });
            const round2 = {
                id: "round-2",
                gameId: gameFixture.id,
                snapshotQuestionId: "snap-q-2",
                roundNumber: 2,
                status: "OPEN",
                snapshotQuestion: {
                    ...snapshotQuestionsFixture[1],
                    options: [],
                },
            };
            transactionClient.round.create.mockResolvedValue(round2);

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionClient.round.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        gameId: gameFixture.id,
                        snapshotQuestionId: "snap-q-2",
                        roundNumber: 2,
                        openedAt: expect.any(Date),
                        expiresAt: expect.any(Date),
                        timeLimit: 30,
                    },
                }),
            );
            expect(result).toEqual({ success: true, round: round2 });
        });

        it("deve retornar GAME_NOT_FOUND quando não houver partida na sala", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [],
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "GAME_NOT_FOUND",
            });
        });

        it("deve retornar ROOM_NOT_IN_PROGRESS quando o Game não estiver IN_PROGRESS ou a sala estiver ARCHIVED", async () => {
            transactionClient.room.findUnique.mockResolvedValueOnce({
                ...roomFixture,
                games: [{ ...gameFixture, status: "WAITING" }],
            });

            expect(
                await repository.createNextRound(
                    roomFixture.id,
                    roomFixture.hostId,
                ),
            ).toEqual({
                success: false,
                reason: "ROOM_NOT_IN_PROGRESS",
            });

            transactionClient.room.findUnique.mockResolvedValueOnce({
                ...roomFixture,
                status: "ARCHIVED",
            });

            expect(
                await repository.createNextRound(
                    roomFixture.id,
                    roomFixture.hostId,
                ),
            ).toEqual({
                success: false,
                reason: "ROOM_NOT_IN_PROGRESS",
            });
        });

        it("deve impedir criação quando a rodada anterior estiver OPEN", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [
                    {
                        ...gameFixture,
                        rounds: [
                            {
                                id: "round-1",
                                gameId: gameFixture.id,
                                snapshotQuestionId: "snap-q-1",
                                roundNumber: 1,
                                status: "OPEN",
                                openedAt: baseDate,
                                closedAt: null,
                                timeLimit: 30,
                            },
                        ],
                    },
                ],
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROUND_ALREADY_OPEN",
            });
        });

        it("deve finalizar o Game sem alterar Room.status quando o deck terminar", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [
                    {
                        ...gameFixture,
                        rounds: [
                            {
                                id: "round-2",
                                gameId: gameFixture.id,
                                snapshotQuestionId: "snap-q-2",
                                roundNumber: 2,
                                status: "CLOSED",
                                openedAt: baseDate,
                                closedAt: baseDate,
                                timeLimit: 30,
                            },
                        ],
                    },
                ],
            });

            const result = await repository.createNextRound(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionClient.game.update).toHaveBeenCalledWith({
                where: { id: gameFixture.id },
                data: {
                    status: "FINISHED",
                    finishedAt: expect.any(Date),
                },
            });
            expect(transactionClient.room.update).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                reason: "DECK_FINISHED",
            });
        });
    });

    describe("closeRound", () => {
        const openRoundFixture = {
            id: "round-1",
            gameId: gameFixture.id,
            roundNumber: 1,
            status: "OPEN" as const,
            openedAt: new Date(Date.now() - 40_000),
            closedAt: null,
            timeLimit: 30,
            game: {
                ...gameFixture,
                room: {
                    id: roomFixture.id,
                    hostId: roomFixture.hostId,
                    status: "ACTIVE" as const,
                },
                players: [
                    { id: "gp-1", nickname: "Alice", score: 120 },
                    { id: "gp-2", nickname: "Bob", score: 0 },
                ],
            },
            snapshotQuestion: {
                ...snapshotQuestionsFixture[0],
                options: [],
            },
            answers: [],
        };

        it("deve encerrar a rodada quando o tempo expirar e retornar alreadyClosed false", async () => {
            transactionClient.round.findUnique.mockResolvedValue(
                openRoundFixture,
            );
            const closed = {
                ...openRoundFixture,
                status: "CLOSED" as const,
                closedAt: new Date(),
            };
            transactionClient.round.update.mockResolvedValue(closed);

            const result = await repository.closeRound(
                "round-1",
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: true,
                round: closed,
                alreadyClosed: false,
                gameFinished: false,
            });
        });

        it("deve ser idempotente quando a rodada já estiver CLOSED", async () => {
            const alreadyClosedRound = {
                ...openRoundFixture,
                status: "CLOSED" as const,
                closedAt: new Date(),
            };
            transactionClient.round.findUnique.mockResolvedValue(
                alreadyClosedRound,
            );

            const result = await repository.closeRound(
                "round-1",
                roomFixture.hostId,
            );

            expect(transactionClient.round.update).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: true,
                round: alreadyClosedRound,
                alreadyClosed: true,
                gameFinished: false,
            });
        });

        it("deve encerrar manualmente antes do timer com allowBeforeExpiration true e exigir tempo/respostas quando false", async () => {
            const futureOpenRound = {
                ...openRoundFixture,
                openedAt: new Date(),
                expiresAt: new Date(Date.now() + 25_000),
                answers: [],
            };
            transactionClient.round.findUnique.mockResolvedValue(futureOpenRound);

            const autoBlocked = await repository.closeRound("round-1");
            expect(transactionClient.round.update).not.toHaveBeenCalled();
            expect(autoBlocked).toEqual({
                success: false,
                reason: "ROUND_NOT_READY",
            });

            const closed = {
                ...futureOpenRound,
                status: "CLOSED" as const,
                closedAt: new Date(),
            };
            transactionClient.round.update.mockResolvedValueOnce(closed);

            const manualAllowed = await repository.closeRound(
                "round-1",
                roomFixture.hostId,
                { allowBeforeExpiration: true },
            );
            expect(transactionClient.round.update).toHaveBeenCalledTimes(1);
            expect(manualAllowed).toEqual({
                success: true,
                round: closed,
                alreadyClosed: false,
                gameFinished: false,
            });
        });
    });
});
