import type { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma.js";
import { getServerNowDate } from "../realtime/server-clock.js";
import { selectCurrentGame } from "../rooms/room.repository.js";
import { filterActiveGamePlayers } from "../rooms/game-player-eligibility.js";

export type RoundWithQuestion = Prisma.RoundGetPayload<{
    include: {
        snapshotQuestion: {
            include: {
                options: {
                    orderBy: {
                        position: "asc";
                    };
                };
            };
        };
    };
}>;

export type ClosedRoundWithDetails = Prisma.RoundGetPayload<{
    include: {
        game: {
            include: {
                room: {
                    select: {
                        id: true;
                        hostId: true;
                        status: true;
                    };
                };
                players: {
                    select: {
                        id: true;
                        nickname: true;
                        avatarId: true;
                        status: true;
                        score: true;
                    };
                    orderBy: { joinedAt: "asc" };
                };
                questionSnapshot: {
                    select: {
                        id: true;
                        _count: {
                            select: {
                                questions: true;
                            };
                        };
                    };
                };
                rounds: {
                    select: {
                        id: true;
                        status: true;
                    };
                };
            };
        };
        snapshotQuestion: {
            include: {
                options: {
                    orderBy: { position: "asc" };
                };
            };
        };
        answers: {
            include: {
                gamePlayer: {
                    select: {
                        id: true;
                        nickname: true;
                        avatarId: true;
                    };
                };
                option: {
                    select: {
                        id: true;
                        text: true;
                        isCorrect: true;
                    };
                };
            };
        };
    };
}>;

export type CloseRoundResult =
    | {
        success: true;
        round: ClosedRoundWithDetails;
        alreadyClosed: boolean;
        gameFinished: boolean;
    }
    | {
        success: false;
        reason:
        | "ROUND_NOT_FOUND"
        | "ACCESS_DENIED"
        | "GAME_NOT_IN_PROGRESS"
        | "ROUND_NOT_READY";
    };

export type CreateNextRoundResult =
    | {
        success: true;
        round: RoundWithQuestion;
    }
    | {
        success: false;
        reason:
        | "ROOM_NOT_FOUND"
        | "ACCESS_DENIED"
        | "ROOM_NOT_IN_PROGRESS"
        | "GAME_NOT_FOUND"
        | "ROUND_ALREADY_OPEN"
        | "PREVIOUS_ROUND_NOT_CLOSED"
        | "DECK_FINISHED";
    };

const closeRoundInclude = {
    game: {
        include: {
            room: {
                select: {
                    id: true,
                    hostId: true,
                    status: true,
                },
            },
            players: {
                select: {
                    id: true,
                    nickname: true,
                    avatarId: true,
                    status: true,
                    score: true,
                },
                orderBy: { joinedAt: "asc" as const },
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
            rounds: {
                select: {
                    id: true,
                    status: true,
                },
            },
        },
    },
    snapshotQuestion: {
        include: {
            options: {
                orderBy: { position: "asc" as const },
            },
        },
    },
    answers: {
        include: {
            gamePlayer: {
                select: {
                    id: true,
                    nickname: true,
                    avatarId: true,
                },
            },
            option: {
                select: {
                    id: true,
                    text: true,
                    isCorrect: true,
                },
            },
        },
    },
};

export class RoundRepository {
    async findExpiredOpenRoundIds(limit = 50): Promise<string[]> {
        const now = getServerNowDate();
        const rows = await prisma.round.findMany({
            where: {
                status: "OPEN",
                expiresAt: {
                    lte: now,
                },
            },
            orderBy: {
                expiresAt: "asc",
            },
            take: limit,
            select: {
                id: true,
            },
        });

        return rows.map((row) => row.id);
    }

    async closeRound(
        roundId: string,
        hostId?: string,
        options?: { allowBeforeExpiration?: boolean },
    ): Promise<CloseRoundResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rounds
                WHERE id = ${roundId}
                FOR UPDATE
            `;

            const round = (await tx.round.findUnique({
                where: { id: roundId },
                include: closeRoundInclude,
            })) as ClosedRoundWithDetails | null;

            if (!round) {
                return { success: false, reason: "ROUND_NOT_FOUND" };
            }

            const game = round.game;
            const room = game.room;

            if (hostId !== undefined && room.hostId !== hostId) {
                return { success: false, reason: "ACCESS_DENIED" };
            }

            // Idempotência: repetir o fechamento (ex.: concorrência worker vs HTTP)
            // não reprocessa pontuação nem falha mesmo que a partida já tenha finalizado.
            if (round.status === "CLOSED") {
                return {
                    success: true,
                    round,
                    alreadyClosed: true,
                    gameFinished: false,
                };
            }

            if (
                room.status !== "ACTIVE" ||
                game.status !== "IN_PROGRESS" ||
                game.finishedAt !== null
            ) {
                return { success: false, reason: "GAME_NOT_IN_PROGRESS" };
            }

            const now = getServerNowDate();
            const expiresAt =
                round.expiresAt ??
                new Date(round.openedAt.getTime() + round.timeLimit * 1000);

            const allowBeforeExpiration = options?.allowBeforeExpiration ?? false;
            const timeExpired = now.getTime() >= expiresAt.getTime();
            const activePlayers = filterActiveGamePlayers(game.players);
            const activePlayerIds = new Set(activePlayers.map((player) => player.id));
            const activeAnswersCount = round.answers.filter((answer) =>
                activePlayerIds.has(answer.gamePlayerId),
            ).length;
            const allPlayersAnswered =
                activePlayers.length > 0 &&
                activeAnswersCount >= activePlayers.length;

            if (!allowBeforeExpiration && !timeExpired && !allPlayersAnswered) {
                return { success: false, reason: "ROUND_NOT_READY" };
            }

            const closedRound = (await tx.round.update({
                where: { id: roundId },
                data: {
                    status: "CLOSED",
                    closedAt: now,
                },
                include: closeRoundInclude,
            })) as ClosedRoundWithDetails;

            const totalSnapshotQuestions =
                game.questionSnapshot?._count?.questions ?? 0;
            const existingRounds = game.rounds ?? [];
            const closedRoundsAfterThis = existingRounds.filter(
                (r) => r.id === roundId || r.status === "CLOSED",
            ).length;

            const isLastRound =
                totalSnapshotQuestions > 0 &&
                closedRoundsAfterThis >= totalSnapshotQuestions;

            if (isLastRound) {
                await tx.game.update({
                    where: { id: game.id },
                    data: {
                        status: "FINISHED",
                        finishedAt: now,
                    },
                });
            }

            return {
                success: true,
                round: closedRound,
                alreadyClosed: false,
                gameFinished: isLastRound,
            };
        });
    }

    async createNextRound(
        roomId: string,
        hostId: string,
    ): Promise<CreateNextRoundResult> {
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

            if (!room) {
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (room.hostId !== hostId) {
                return {
                    success: false,
                    reason: "ACCESS_DENIED",
                };
            }

            if (room.status !== "ACTIVE") {
                return {
                    success: false,
                    reason: "ROOM_NOT_IN_PROGRESS",
                };
            }

            const currentGame = selectCurrentGame(room.games);

            if (!currentGame) {
                return {
                    success: false,
                    reason: "GAME_NOT_FOUND",
                };
            }

            if (currentGame.status !== "IN_PROGRESS") {
                return {
                    success: false,
                    reason: "ROOM_NOT_IN_PROGRESS",
                };
            }

            const previousRound = currentGame.rounds[0];

            if (previousRound?.status === "OPEN") {
                return {
                    success: false,
                    reason: "ROUND_ALREADY_OPEN",
                };
            }

            if (
                previousRound &&
                previousRound.status !== "CLOSED"
            ) {
                return {
                    success: false,
                    reason: "PREVIOUS_ROUND_NOT_CLOSED",
                };
            }

            const snapshotQuestions =
                currentGame.questionSnapshot?.questions ?? [];

            const nextPosition = previousRound
                ? previousRound.roundNumber
                : 0;

            const nextQuestion = snapshotQuestions.find(
                (question) => question.position === nextPosition,
            );

            const now = getServerNowDate();

            if (!nextQuestion) {
                await tx.game.update({
                    where: { id: currentGame.id },
                    data: {
                        status: "FINISHED",
                        finishedAt: now,
                    },
                });

                return {
                    success: false,
                    reason: "DECK_FINISHED",
                };
            }

            const openedAt = now;
            const expiresAt = new Date(
                openedAt.getTime() + currentGame.questionTime * 1000,
            );

            const round = await tx.round.create({
                data: {
                    gameId: currentGame.id,
                    snapshotQuestionId: nextQuestion.id,
                    roundNumber: nextPosition + 1,
                    openedAt,
                    expiresAt,
                    timeLimit: currentGame.questionTime,
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

            return {
                success: true,
                round,
            };
        });
    }
}
