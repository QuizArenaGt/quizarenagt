
import type { GamePlayer, GamePlayerStatus } from "@prisma/client";

import { prisma } from "../database/prisma.js";
import { isGamePlayerActive } from "./game-player-eligibility.js";
import { selectCurrentGame } from "./room.repository.js";

import {
    cancelInProgressGameIfInsufficientPlayersTx,
    type CancelledGameSummary,
} from "./game-cancellation.js";

export type LeaveRoomResult =
    | {
        success: true;
        roomId: string;
        gameId: string;
        gameStatus: "WAITING" | "IN_PROGRESS";
        player: {
            id: string;
            nickname: string;
            status: GamePlayerStatus;
            score: number;
        };
        eligiblePlayerCount: number;
        openRoundId: string | null;
        cancelledGame?: CancelledGameSummary | null;
    }
    | {
        success: false;
        reason:
        | "ROOM_NOT_FOUND"
        | "ROOM_ARCHIVED"
        | "GAME_NOT_FOUND"
        | "GAME_NOT_LEAVABLE"
        | "PLAYER_NOT_ACTIVE";
    };

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
        return prisma.gamePlayer.findFirst({
            where: {
                gameId,
                nickname,
                status: "ACTIVE",
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

            const existingPlayer = await tx.gamePlayer.findFirst({
                where: {
                    gameId: currentGame.id,
                    nickname: data.nickname,
                    status: "ACTIVE",
                },
            });

            if (existingPlayer) {
                throw new Error("DUPLICATE_NICKNAME");
            }

            const playerCount = await tx.gamePlayer.count({
                where: {
                    gameId: currentGame.id,
                    status: "ACTIVE",
                },
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

    async leaveRoom(
        gamePlayerId: string,
        roomId: string,
    ): Promise<LeaveRoomResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: roomId },
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
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (room.status !== "ACTIVE") {
                return {
                    success: false,
                    reason: "ROOM_ARCHIVED",
                };
            }

            const currentGame = selectCurrentGame(room.games);

            if (!currentGame) {
                return {
                    success: false,
                    reason: "GAME_NOT_FOUND",
                };
            }

            const player = await tx.gamePlayer.findUnique({
                where: { id: gamePlayerId },
                select: {
                    id: true,
                    gameId: true,
                    nickname: true,
                    status: true,
                    score: true,
                },
            });

            if (
                !player ||
                player.gameId !== currentGame.id ||
                !isGamePlayerActive(player)
            ) {
                return {
                    success: false,
                    reason: "PLAYER_NOT_ACTIVE",
                };
            }

            if (currentGame.status === "WAITING") {
                await tx.gamePlayer.delete({
                    where: { id: player.id },
                });

                const eligiblePlayerCount = await tx.gamePlayer.count({
                    where: {
                        gameId: currentGame.id,
                        status: "ACTIVE",
                    },
                });

                return {
                    success: true,
                    roomId: room.id,
                    gameId: currentGame.id,
                    gameStatus: "WAITING",
                    player: {
                        id: player.id,
                        nickname: player.nickname,
                        status: "LEFT",
                        score: player.score,
                    },
                    eligiblePlayerCount,
                    openRoundId: null,
                };
            }

            if (currentGame.status === "IN_PROGRESS") {
                const updatedPlayer = await tx.gamePlayer.update({
                    where: { id: player.id },
                    data: {
                        status: "LEFT",
                        sessionTokenHash: null,
                    },
                    select: {
                        id: true,
                        nickname: true,
                        status: true,
                        score: true,
                    },
                });

                const eligiblePlayerCount = await tx.gamePlayer.count({
                    where: {
                        gameId: currentGame.id,
                        status: "ACTIVE",
                    },
                });

                const cancelledGame =
                    await cancelInProgressGameIfInsufficientPlayersTx(
                        tx,
                        currentGame.id,
                        eligiblePlayerCount,
                    );

                const openRound = cancelledGame
                    ? null
                    : await tx.round.findFirst({
                        where: {
                            gameId: currentGame.id,
                            status: "OPEN",
                        },
                        select: {
                            id: true,
                        },
                    });

                return {
                    success: true,
                    roomId: room.id,
                    gameId: currentGame.id,
                    gameStatus: "IN_PROGRESS",
                    player: updatedPlayer,
                    eligiblePlayerCount,
                    openRoundId: openRound?.id ?? null,
                    cancelledGame,
                };
            }

            return {
                success: false,
                reason: "GAME_NOT_LEAVABLE",
            };
        });
    }
}

export { RoomPlayerRepository as GamePlayerRepository };
