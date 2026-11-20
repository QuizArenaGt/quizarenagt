import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionClient } = vi.hoisted(() => {
    const transactionClient = {
        $queryRaw: vi.fn(),
        room: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        gamePlayer: {
            count: vi.fn(),
        },
        question: {
            findMany: vi.fn(),
        },
        roomQuestionSnapshot: {
            create: vi.fn(),
        },
        game: {
            create: vi.fn(),
            update: vi.fn(),
        },
    };

    return {
        transactionClient,
        prismaMock: {
            room: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
            },
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

import { RoomRepository } from "../../src/rooms/room.repository.js";

describe("RoomRepository", () => {
    let repository: RoomRepository;

    const gameFixture = {
        id: "game-test-uuid",
        roomId: "room-test-uuid",
        status: "WAITING" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-11-18T12:00:00.000Z"),
        updatedAt: new Date("2026-11-18T12:00:00.000Z"),
    };

    const roomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        name: "Sala Teste",
        theme: "Geral",
        hostId: "user-host-uuid",
        status: "ACTIVE" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        createdAt: new Date("2026-11-18T12:00:00.000Z"),
        updatedAt: new Date("2026-11-18T12:00:00.000Z"),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new RoomRepository();
    });

    describe("findById", () => {
        it("deve encontrar uma sala pelo ID", async () => {
            prismaMock.room.findUnique.mockResolvedValue(roomFixture);

            const result = await repository.findById(roomFixture.id);

            expect(prismaMock.room.findUnique).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
            });
            expect(result).toEqual(roomFixture);
        });

        it("deve retornar null quando a sala não existir", async () => {
            prismaMock.room.findUnique.mockResolvedValue(null);

            const result = await repository.findById("inexistente");

            expect(result).toBeNull();
        });
    });

    describe("findByCode", () => {
        it("deve encontrar uma sala pelo código", async () => {
            prismaMock.room.findUnique.mockResolvedValue(roomFixture);

            const result = await repository.findByCode("ABC123");

            expect(prismaMock.room.findUnique).toHaveBeenCalledWith({
                where: { code: "ABC123" },
            });
            expect(result).toEqual(roomFixture);
        });

        it("deve retornar null quando o código não existir", async () => {
            prismaMock.room.findUnique.mockResolvedValue(null);

            const result = await repository.findByCode("ZZZZZZ");

            expect(result).toBeNull();
        });
    });

    describe("findManyByHostId", () => {
        it("deve listar as salas ativas de um host incluindo games e jogadores", async () => {
            const listed = [
                {
                    ...roomFixture,
                    games: [{ ...gameFixture, players: [] }],
                },
            ];
            prismaMock.room.findMany.mockResolvedValue(listed);

            const result = await repository.findManyByHostId("user-host-uuid");

            expect(prismaMock.room.findMany).toHaveBeenCalledWith({
                where: {
                    hostId: "user-host-uuid",
                    status: "ACTIVE",
                },
                orderBy: { createdAt: "desc" },
                include: {
                    games: {
                        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                        include: expect.objectContaining({
                            players: {
                                select: {
                                    id: true,
                                    nickname: true,
                                    score: true,
                                    joinedAt: true,
                                },
                                orderBy: { joinedAt: "asc" },
                            },
                            questionSnapshot: {
                                select: {
                                    id: true,
                                    _count: {
                                        select: {
                                            questions: true,
                                        },
                                    },
                                },
                            },
                            rounds: expect.any(Object),
                        }),
                    },
                },
            });
            expect(result).toEqual(listed);
        });

        it("deve retornar uma lista vazia quando o host não possuir salas", async () => {
            prismaMock.room.findMany.mockResolvedValue([]);

            const result = await repository.findManyByHostId("sem-salas");

            expect(result).toEqual([]);
        });
    });

    describe("create", () => {
        it("deve criar uma sala ACTIVE e sua primeira partida WAITING na mesma transação", async () => {
            const createdRoom = {
                ...roomFixture,
                games: [{ ...gameFixture, players: [] }],
            };
            transactionClient.room.create.mockResolvedValue(createdRoom);

            const result = await repository.create({
                code: "ABC123",
                name: "Sala Teste",
                theme: "Geral",
                hostId: "user-host-uuid",
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "CLASSIC",
            });

            expect(transactionClient.room.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        code: "ABC123",
                        status: "ACTIVE",
                        maxPlayers: 10,
                        questionTime: 30,
                        gameMode: "CLASSIC",
                        games: {
                            create: {
                                status: "WAITING",
                                maxPlayers: 10,
                                questionTime: 30,
                                gameMode: "CLASSIC",
                                startedAt: null,
                                finishedAt: null,
                            },
                        },
                    }),
                }),
            );
            expect(result).toEqual(createdRoom);
        });
    });

    describe("update", () => {
        it("deve atualizar a sala e sincronizar o Game em WAITING quando informado", async () => {
            const updatedRoom = {
                ...roomFixture,
                maxPlayers: 20,
                games: [{ ...gameFixture, maxPlayers: 20, players: [] }],
            };
            transactionClient.room.update.mockResolvedValue(updatedRoom);

            const result = await repository.update(
                roomFixture.id,
                { maxPlayers: 20 },
                gameFixture.id,
            );

            expect(transactionClient.$queryRaw).toHaveBeenCalled();
            expect(transactionClient.game.update).toHaveBeenCalledWith({
                where: { id: gameFixture.id },
                data: { maxPlayers: 20 },
            });
            expect(transactionClient.room.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: roomFixture.id },
                    data: { maxPlayers: 20 },
                }),
            );
            expect(result).toEqual(updatedRoom);
        });

        it("não deve alterar games anteriores quando waitingGameId não for informado", async () => {
            const updatedRoom = {
                ...roomFixture,
                questionTime: 45,
                games: [{ ...gameFixture, status: "FINISHED", players: [] }],
            };
            transactionClient.room.update.mockResolvedValue(updatedRoom);

            await repository.update(roomFixture.id, { questionTime: 45 }, null);

            expect(transactionClient.game.update).not.toHaveBeenCalled();
            expect(transactionClient.room.update).toHaveBeenCalled();
        });
    });

    describe("startIfReady", () => {
        const questionsFixture = Array.from({ length: 5 }, (_, index) => ({
            id: `question-${index + 1}`,
            roomId: roomFixture.id,
            statement: `Pergunta ${index + 1}?`,
            type: "MULTIPLE_CHOICE",
            isActive: true,
            createdAt: new Date(`2026-11-18T12:0${index}:00.000Z`),
            options: [
                {
                    id: `opt-${index}-a`,
                    text: "Opção A",
                    isCorrect: true,
                    position: 0,
                },
                {
                    id: `opt-${index}-b`,
                    text: "Opção B",
                    isCorrect: false,
                    position: 1,
                },
            ],
        }));

        it("deve criar o snapshot vinculado ao gameId e atualizar o Game para IN_PROGRESS", async () => {
            const startedGame = {
                ...gameFixture,
                status: "IN_PROGRESS" as const,
                startedAt: new Date("2026-11-18T12:10:00.000Z"),
            };

            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [gameFixture],
            });
            transactionClient.gamePlayer.count.mockResolvedValue(2);
            transactionClient.question.findMany.mockResolvedValue(questionsFixture);
            transactionClient.roomQuestionSnapshot.create.mockResolvedValue({
                id: "snapshot-uuid",
            });
            transactionClient.game.update.mockResolvedValue(startedGame);

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionClient.gamePlayer.count).toHaveBeenCalledWith({
                where: { gameId: gameFixture.id },
            });
            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        gameId: gameFixture.id,
                    }),
                }),
            );
            expect(transactionClient.game.update).toHaveBeenCalledWith({
                where: { id: gameFixture.id },
                data: {
                    status: "IN_PROGRESS",
                    startedAt: expect.any(Date),
                },
            });
            expect(result).toEqual({
                success: true,
                room: { ...roomFixture, games: [gameFixture] },
                game: startedGame,
            });
        });

        it("deve retornar ROOM_NOT_FOUND quando a sala não existir", async () => {
            transactionClient.room.findUnique.mockResolvedValue(null);

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });
        });

        it("deve retornar ACCESS_DENIED quando o usuário não for o host", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [gameFixture],
            });

            const result = await repository.startIfReady(
                roomFixture.id,
                "outro-host",
            );

            expect(result).toEqual({
                success: false,
                reason: "ACCESS_DENIED",
            });
        });

        it("deve retornar ROOM_NOT_WAITING quando não houver Game WAITING ou a sala estiver ARCHIVED", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [{ ...gameFixture, status: "IN_PROGRESS" }],
            });

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_NOT_WAITING",
            });
        });

        it("deve retornar NOT_ENOUGH_PLAYERS quando houver menos de 2 jogadores no Game", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [gameFixture],
            });
            transactionClient.gamePlayer.count.mockResolvedValue(1);

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "NOT_ENOUGH_PLAYERS",
            });
        });

        it("deve retornar NOT_ENOUGH_QUESTIONS quando houver menos de 5 perguntas ativas", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [gameFixture],
            });
            transactionClient.gamePlayer.count.mockResolvedValue(2);
            transactionClient.question.findMany.mockResolvedValue(
                questionsFixture.slice(0, 4),
            );

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "NOT_ENOUGH_QUESTIONS",
            });
        });
    });

    describe("createNextGame", () => {
        it("deve criar uma nova partida WAITING com snapshot das configurações atuais da sala", async () => {
            const finishedGame = {
                ...gameFixture,
                status: "FINISHED" as const,
            };
            const newGame = {
                ...gameFixture,
                id: "game-2-uuid",
                status: "WAITING" as const,
            };

            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                maxPlayers: 15,
                questionTime: 45,
                gameMode: "HARDCORE",
                games: [finishedGame],
            });
            transactionClient.game.create.mockResolvedValue(newGame);

            const result = await repository.createNextGame(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionClient.game.create).toHaveBeenCalledWith({
                data: {
                    roomId: roomFixture.id,
                    status: "WAITING",
                    maxPlayers: 15,
                    questionTime: 45,
                    gameMode: "HARDCORE",
                    startedAt: null,
                    finishedAt: null,
                },
            });
            expect(result).toEqual({
                success: true,
                room: expect.objectContaining({ id: roomFixture.id }),
                game: newGame,
            });
        });

        it("deve retornar ROOM_ARCHIVED quando a sala estiver arquivada", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                status: "ARCHIVED",
                games: [],
            });

            const result = await repository.createNextGame(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_ARCHIVED",
            });
        });

        it("deve retornar ACTIVE_GAME_EXISTS quando já existir partida WAITING ou IN_PROGRESS", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [gameFixture],
            });

            const result = await repository.createNextGame(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ACTIVE_GAME_EXISTS",
            });
        });
    });
});
