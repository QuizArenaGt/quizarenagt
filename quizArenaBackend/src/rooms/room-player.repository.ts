
import type { GamePlayer } from "@prisma/client";

import { prisma } from "../database/prisma.js";

type CreateGamePlayerData = {
    gameId: string;
    userId?: string | null;
    nickname: string;
    sessionTokenHash: string;
};

type CreateRoomGamePlayerInput = {
    roomId: string;
    userId?: string | null;
    nickname: string;
    sessionTokenHash: string;
};

export class RoomPlayerRepository {
    async findById(id: string): Promise<GamePlayer | null> {
        return prisma.gamePlayer.findUnique({
            where: { id },
        });
    }

    async findManyByGameId(gameId: string): Promise<GamePlayer[]> {
        return prisma.gamePlayer.findMany({
            where: { gameId },
            orderBy: { joinedAt: "asc" },
        });
    }

    async countByGameId(gameId: string): Promise<number> {
        return prisma.gamePlayer.count({
            where: { gameId },
        });
    }

    async findByGameAndUser(
        gameId: string,
        userId: string,
    ): Promise<GamePlayer | null> {
        return prisma.gamePlayer.findUnique({
            where: {
                gameId_userId: {
                    gameId,
                    userId,
                },
            },
        });
    }

    async findByGameAndNickname(
        gameId: string,
        nickname: string,
    ): Promise<GamePlayer | null> {
        return prisma.gamePlayer.findUnique({
            where: {
                gameId_nickname: {
                    gameId,
                    nickname,
                },
            },
        });
    }

    async create(data: CreateGamePlayerData): Promise<GamePlayer> {
        return prisma.gamePlayer.create({
            data,
        });
    }

    async delete(id: string): Promise<GamePlayer> {
        return prisma.gamePlayer.delete({
            where: { id },
        });
    }

    async findBySessionTokenHash(
        sessionTokenHash: string,
    ) {
        return prisma.gamePlayer.findUnique({
            where: { sessionTokenHash },
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
    }

    async createIfRoomHasCapacity(
        data: CreateRoomGamePlayerInput,
    ): Promise<GamePlayer & { roomId: string }> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${data.roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: data.roomId },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                    },
                },
            });

            if (!room) {
                throw new Error("ROOM_NOT_FOUND");
            }

            if (room.status !== "ACTIVE") {
                throw new Error("ROOM_NOT_JOINABLE");
            }

            const currentGame =
                room.games.find(
                    (game) =>
                        game.status === "WAITING" ||
                        game.status === "IN_PROGRESS",
                ) ?? room.games[0];

            if (!currentGame || currentGame.status !== "WAITING") {
                throw new Error("ROOM_NOT_JOINABLE");
            }

            const existingPlayer = await tx.gamePlayer.findUnique({
                where: {
                    gameId_nickname: {
                        gameId: currentGame.id,
                        nickname: data.nickname,
                    },
                },
            });

            if (existingPlayer) {
                throw new Error("DUPLICATE_NICKNAME");
            }

            const playerCount = await tx.gamePlayer.count({
                where: { gameId: currentGame.id },
            });

            if (playerCount >= currentGame.maxPlayers) {
                throw new Error("ROOM_FULL");
            }

            const createdPlayer = await tx.gamePlayer.create({
                data: {
                    gameId: currentGame.id,
                    userId: data.userId ?? null,
                    nickname: data.nickname,
                    sessionTokenHash: data.sessionTokenHash,
                },
            });

            return {
                ...createdPlayer,
                roomId: room.id,
            };
        });
    }
}

export { RoomPlayerRepository as GamePlayerRepository };
