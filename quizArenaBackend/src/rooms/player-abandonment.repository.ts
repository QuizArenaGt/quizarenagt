import type { GamePlayerStatus } from "@prisma/client";

import { prisma } from "../database/prisma.js";
import { getServerNowDate } from "../realtime/server-clock.js";

import {
    cancelInProgressGameIfInsufficientPlayersTx,
    type CancelledGameSummary,
} from "./game-cancellation.js";

export type AbandonExpiredPlayerResult =
    | {
        abandoned: true;
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
        cancelledGame: CancelledGameSummary | null;
    }
    | {
        abandoned: false;
        reason:
        | "PLAYER_NOT_FOUND"
        | "ALREADY_INACTIVE"
        | "ROOM_ARCHIVED"
        | "GAME_NOT_ACTIVE"
        | "ALREADY_RECONNECTED"
        | "NOT_EXPIRED"
        | "HAS_ACTIVE_SOCKET";
    };

export class PlayerAbandonmentRepository {
    async findExpiredCandidateIds(limit = 50): Promise<string[]> {
        const now = getServerNowDate();
        const rows = await prisma.gamePlayer.findMany({
            where: {
                status: "ACTIVE",
                reconnectDeadlineAt: {
                    not: null,
                    lte: now,
                },
                game: {
                    status: {
                        in: ["WAITING", "IN_PROGRESS"],
                    },
                    room: {
                        status: "ACTIVE",
                    },
                },
            },
            orderBy: {
                reconnectDeadlineAt: "asc",
            },
            take: limit,
            select: {
                id: true,
            },
        });

        return rows.map((row) => row.id);
    }

    async abandonExpiredPlayer(
        playerId: string,
        hasActiveSocket: (playerId: string) => boolean,
    ): Promise<AbandonExpiredPlayerResult> {
        return prisma.$transaction(async (tx) => {
            // Mantém ordem de lock rooms -> rounds para evitar deadlock com join, leave, start e finish.
            await tx.$queryRaw`
                SELECT r.id
                FROM rooms r
                INNER JOIN games g ON g."roomId" = r.id
                INNER JOIN game_players gp ON gp."gameId" = g.id
                WHERE gp.id = ${playerId}
                FOR UPDATE OF r
            `;

            const player = await tx.gamePlayer.findUnique({
                where: { id: playerId },
                select: {
                    id: true,
                    gameId: true,
                    nickname: true,
                    status: true,
                    score: true,
                    reconnectDeadlineAt: true,
                    game: {
                        select: {
                            id: true,
                            roomId: true,
                            status: true,
                            room: {
                                select: {
                                    status: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!player || !player.game || !player.game.room) {
                return {
                    abandoned: false,
                    reason: "PLAYER_NOT_FOUND",
                };
            }

            if (player.status !== "ACTIVE") {
                return {
                    abandoned: false,
                    reason: "ALREADY_INACTIVE",
                };
            }

            if (player.game.room.status !== "ACTIVE") {
                return {
                    abandoned: false,
                    reason: "ROOM_ARCHIVED",
                };
            }

            if (
                player.game.status !== "WAITING" &&
                player.game.status !== "IN_PROGRESS"
            ) {
                return {
                    abandoned: false,
                    reason: "GAME_NOT_ACTIVE",
                };
            }

            if (!player.reconnectDeadlineAt) {
                return {
                    abandoned: false,
                    reason: "ALREADY_RECONNECTED",
                };
            }

            const now = getServerNowDate();

            if (player.reconnectDeadlineAt.getTime() > now.getTime()) {
                return {
                    abandoned: false,
                    reason: "NOT_EXPIRED",
                };
            }

            // Nunca abandona participante que já possui socket ativo; limpa eventual deadline obsoleto.
            if (hasActiveSocket(player.id)) {
                await tx.gamePlayer.update({
                    where: { id: player.id },
                    data: {
                        disconnectedAt: null,
                        reconnectDeadlineAt: null,
                    },
                });

                return {
                    abandoned: false,
                    reason: "HAS_ACTIVE_SOCKET",
                };
            }

            const updatedPlayer = await tx.gamePlayer.update({
                where: { id: player.id },
                data: {
                    status: "ABANDONED",
                    sessionTokenHash: null,
                    disconnectedAt: null,
                    reconnectDeadlineAt: null,
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
                    gameId: player.gameId,
                    status: "ACTIVE",
                },
            });

            const cancelledGame =
                player.game.status === "IN_PROGRESS"
                    ? await cancelInProgressGameIfInsufficientPlayersTx(
                          tx,
                          player.gameId,
                          eligiblePlayerCount,
                      )
                    : null;

            const openRound =
                player.game.status === "IN_PROGRESS" && !cancelledGame
                    ? await tx.round.findFirst({
                        where: {
                            gameId: player.gameId,
                            status: "OPEN",
                        },
                        select: {
                            id: true,
                        },
                    })
                    : null;

            return {
                abandoned: true,
                roomId: player.game.roomId,
                gameId: player.gameId,
                gameStatus: player.game.status,
                player: updatedPlayer,
                eligiblePlayerCount,
                openRoundId: openRound?.id ?? null,
                cancelledGame,
            };
        });
    }
}
