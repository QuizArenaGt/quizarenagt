import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionClient } = vi.hoisted(() => {
    const transactionClient = {
        $queryRaw: vi.fn(),
        room: {
            findUnique: vi.fn(),
        },
        gamePlayer: {
            findUnique: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
        },
    };

    return {
        transactionClient,
        prismaMock: {
            gamePlayer: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
                count: vi.fn(),
                create: vi.fn(),
                delete: vi.fn(),
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

import { RoomPlayerRepository } from "../../src/rooms/room-player.repository.js";

describe("RoomPlayerRepository", () => {
    let repository: RoomPlayerRepository;

    const playerFixture = {
        id: "player-test-uuid",
        gameId: "game-test-uuid",
        userId: "user-test-uuid",
        nickname: "Alice",
        sessionTokenHash: "token-hash-123",
        score: 0,
        joinedAt: new Date("2026-11-18T12:00:00.000Z"),
    };

    const roomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        name: "Sala Geral",
        theme: "Geral",
        hostId: "host-test-uuid",
        status: "ACTIVE" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        createdAt: new Date("2026-11-18T11:50:00.000Z"),
        updatedAt: new Date("2026-11-18T11:50:00.000Z"),
        games: [
            {
                id: "game-test-uuid",
                roomId: "room-test-uuid",
                status: "WAITING" as const,
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "CLASSIC" as const,
                startedAt: null,
                finishedAt: null,
                createdAt: new Date("2026-11-18T11:50:00.000Z"),
                updatedAt: new Date("2026-11-18T11:50:00.000Z"),
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new RoomPlayerRepository();
    });

    describe("findById", () => {
        it("deve encontrar um participante pelo ID", async () => {
            prismaMock.gamePlayer.findUnique.mockResolvedValue(playerFixture);

            const result = await repository.findById(playerFixture.id);

            expect(prismaMock.gamePlayer.findUnique).toHaveBeenCalledWith({
                where: { id: playerFixture.id },
            });
            expect(result).toEqual(playerFixture);
        });

        it("deve retornar null quando o participante não existir", async () => {
            prismaMock.gamePlayer.findUnique.mockResolvedValue(null);

            const result = await repository.findById("inexistente");

            expect(result).toBeNull();
        });
    });

    describe("findManyByGameId", () => {
        it("deve listar os participantes da partida ordenados por entrada", async () => {
            prismaMock.gamePlayer.findMany.mockResolvedValue([playerFixture]);

            const result = await repository.findManyByGameId(playerFixture.gameId);

            expect(prismaMock.gamePlayer.findMany).toHaveBeenCalledWith({
                where: { gameId: playerFixture.gameId },
                orderBy: { joinedAt: "asc" },
            });
            expect(result).toEqual([playerFixture]);
        });
    });

    describe("countByGameId", () => {
        it("deve retornar a quantidade de participantes da partida", async () => {
            prismaMock.gamePlayer.count.mockResolvedValue(4);

            const result = await repository.countByGameId(playerFixture.gameId);

            expect(prismaMock.gamePlayer.count).toHaveBeenCalledWith({
                where: { gameId: playerFixture.gameId },
            });
            expect(result).toBe(4);
        });

        it("deve retornar zero quando a partida não possuir participantes", async () => {
            prismaMock.gamePlayer.count.mockResolvedValue(0);

            const result = await repository.countByGameId(playerFixture.gameId);

            expect(result).toBe(0);
        });
    });

    describe("findByGameAndUser", () => {
        it("deve buscar participante por gameId e userId", async () => {
            prismaMock.gamePlayer.findUnique.mockResolvedValue(playerFixture);

            const result = await repository.findByGameAndUser(
                playerFixture.gameId,
                playerFixture.userId,
            );

            expect(prismaMock.gamePlayer.findUnique).toHaveBeenCalledWith({
                where: {
                    gameId_userId: {
                        gameId: playerFixture.gameId,
                        userId: playerFixture.userId,
                    },
                },
            });
            expect(result).toEqual(playerFixture);
        });
    });

    describe("findByGameAndNickname", () => {
        it("deve buscar participante por gameId e nickname", async () => {
            prismaMock.gamePlayer.findUnique.mockResolvedValue(playerFixture);

            const result = await repository.findByGameAndNickname(
                playerFixture.gameId,
                playerFixture.nickname,
            );

            expect(prismaMock.gamePlayer.findUnique).toHaveBeenCalledWith({
                where: {
                    gameId_nickname: {
                        gameId: playerFixture.gameId,
                        nickname: playerFixture.nickname,
                    },
                },
            });
            expect(result).toEqual(playerFixture);
        });
    });

    describe("create", () => {
        it("deve criar um GamePlayer na partida", async () => {
            prismaMock.gamePlayer.create.mockResolvedValue(playerFixture);

            const result = await repository.create({
                gameId: playerFixture.gameId,
                userId: playerFixture.userId,
                nickname: playerFixture.nickname,
                sessionTokenHash: playerFixture.sessionTokenHash,
            });

            expect(prismaMock.gamePlayer.create).toHaveBeenCalledWith({
                data: {
                    gameId: playerFixture.gameId,
                    userId: playerFixture.userId,
                    nickname: playerFixture.nickname,
                    sessionTokenHash: playerFixture.sessionTokenHash,
                },
            });
            expect(result).toEqual(playerFixture);
        });
    });

    describe("findBySessionTokenHash", () => {
        it("deve incluir os dados do Game e da Room para validação de sessão", async () => {
            const sessionPlayer = {
                ...playerFixture,
                game: {
                    id: playerFixture.gameId,
                    roomId: roomFixture.id,
                    status: "WAITING",
                    room: {
                        id: roomFixture.id,
                        status: "ACTIVE",
                        games: [{ id: playerFixture.gameId, status: "WAITING" }],
                    },
                },
            };
            prismaMock.gamePlayer.findUnique.mockResolvedValue(sessionPlayer);

            const result = await repository.findBySessionTokenHash("token-hash");

            expect(prismaMock.gamePlayer.findUnique).toHaveBeenCalledWith({
                where: { sessionTokenHash: "token-hash" },
                include: {
                    game: {
                        select: {
                            id: true,
                            roomId: true,
                            status: true,
                            room: {
                                select: {
                                    id: true,
                                    status: true,
                                    games: {
                                        orderBy: [
                                            { createdAt: "desc" },
                                            { id: "desc" },
                                        ],
                                        select: {
                                            id: true,
                                            status: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            expect(result).toEqual(sessionPlayer);
        });
    });

    describe("createIfRoomHasCapacity", () => {
        it("deve criar GamePlayer na partida WAITING quando houver vaga", async () => {
            transactionClient.room.findUnique.mockResolvedValue(roomFixture);
            transactionClient.gamePlayer.findUnique.mockResolvedValue(null);
            transactionClient.gamePlayer.count.mockResolvedValue(2);
            transactionClient.gamePlayer.create.mockResolvedValue(playerFixture);

            const result = await repository.createIfRoomHasCapacity({
                roomId: roomFixture.id,
                userId: playerFixture.userId,
                nickname: playerFixture.nickname,
                sessionTokenHash: playerFixture.sessionTokenHash,
            });

            expect(transactionClient.$queryRaw).toHaveBeenCalled();
            expect(transactionClient.gamePlayer.create).toHaveBeenCalledWith({
                data: {
                    gameId: "game-test-uuid",
                    userId: playerFixture.userId,
                    nickname: playerFixture.nickname,
                    sessionTokenHash: playerFixture.sessionTokenHash,
                },
            });
            expect(result).toEqual({
                ...playerFixture,
                roomId: roomFixture.id,
            });
        });

        it("deve lançar ROOM_NOT_FOUND quando a sala não existir", async () => {
            transactionClient.room.findUnique.mockResolvedValue(null);

            await expect(
                repository.createIfRoomHasCapacity({
                    roomId: roomFixture.id,
                    nickname: "Alice",
                    sessionTokenHash: "hash",
                }),
            ).rejects.toThrow("ROOM_NOT_FOUND");
        });

        it("deve lançar ROOM_NOT_JOINABLE quando a sala estiver arquivada ou partida não estiver WAITING", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                status: "ARCHIVED",
            });

            await expect(
                repository.createIfRoomHasCapacity({
                    roomId: roomFixture.id,
                    nickname: "Alice",
                    sessionTokenHash: "hash",
                }),
            ).rejects.toThrow("ROOM_NOT_JOINABLE");

            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [{ ...roomFixture.games[0], status: "IN_PROGRESS" }],
            });

            await expect(
                repository.createIfRoomHasCapacity({
                    roomId: roomFixture.id,
                    nickname: "Alice",
                    sessionTokenHash: "hash",
                }),
            ).rejects.toThrow("ROOM_NOT_JOINABLE");
        });

        it("deve lançar DUPLICATE_NICKNAME quando o nickname já estiver em uso no Game", async () => {
            transactionClient.room.findUnique.mockResolvedValue(roomFixture);
            transactionClient.gamePlayer.findUnique.mockResolvedValue(playerFixture);

            await expect(
                repository.createIfRoomHasCapacity({
                    roomId: roomFixture.id,
                    nickname: "Alice",
                    sessionTokenHash: "hash",
                }),
            ).rejects.toThrow("DUPLICATE_NICKNAME");
        });

        it("deve lançar ROOM_FULL quando a partida atingir maxPlayers", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                games: [{ ...roomFixture.games[0], maxPlayers: 2 }],
            });
            transactionClient.gamePlayer.findUnique.mockResolvedValue(null);
            transactionClient.gamePlayer.count.mockResolvedValue(2);

            await expect(
                repository.createIfRoomHasCapacity({
                    roomId: roomFixture.id,
                    nickname: "Bob",
                    sessionTokenHash: "hash",
                }),
            ).rejects.toThrow("ROOM_FULL");
        });
    });
});
