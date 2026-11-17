
import type { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma.js";

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

export class RoundRepository {

    async closeRound(
        roundId: string,
        hostId: string,
    ) {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rounds
                WHERE id = ${roundId}
                FOR UPDATE
            `;

            const round = await tx.round.findUnique({
                where: { id: roundId },
                include: {
                    game: {
                        include: {
                            room: {
                                include: {
                                    players: {
                                        select: {
                                            id: true,
                                            nickname: true,
                                            score: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    snapshotQuestion: {
                        include: {
                            options: {
                                orderBy: { position: "asc" },
                            },
                        },
                    },
                    answers: {
                        include: {
                            roomPlayer: {
                                select: {
                                    id: true,
                                    nickname: true,
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
                },
            });

            if (!round) {
                return { success: false as const, reason: "ROUND_NOT_FOUND" as const };
            }

            const room = round.game.room;

            if (room.hostId !== hostId) {
                return { success: false as const, reason: "ACCESS_DENIED" as const };
            }

            if (
                room.status !== "IN_PROGRESS" ||
                round.game.finishedAt !== null
            ) {
                return { success: false as const, reason: "GAME_NOT_IN_PROGRESS" as const };
            }

            // Repetir a chamada não processa a rodada novamente.
            if (round.status === "CLOSED") {
                return { success: true as const, round };
            }

            const elapsedMs = Date.now() - round.openedAt.getTime();
            const timeExpired = elapsedMs >= round.timeLimit * 1000;

            const allPlayersAnswered =
                room.players.length > 0 &&
                round.answers.length >= room.players.length;

            if (!timeExpired && !allPlayersAnswered) {
                return { success: false as const, reason: "ROUND_NOT_READY" as const };
            }

            const closedRound = await tx.round.update({
                where: { id: roundId },
                data: {
                    status: "CLOSED",
                    closedAt: new Date(),
                },
                include: {
                    game: {
                        include: {
                            room: {
                                include: {
                                    players: {
                                        select: {
                                            id: true,
                                            nickname: true,
                                            score: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    snapshotQuestion: {
                        include: {
                            options: {
                                orderBy: { position: "asc" },
                            },
                        },
                    },
                    answers: {
                        include: {
                            roomPlayer: {
                                select: {
                                    id: true,
                                    nickname: true,
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
                },
            });

            return {
                success: true as const,
                round: closedRound,
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

            if (room.status !== "IN_PROGRESS") {
                return {
                    success: false,
                    reason: "ROOM_NOT_IN_PROGRESS",
                };
            }

            if (!room.game) {
                return {
                    success: false,
                    reason: "GAME_NOT_FOUND",
                };
            }

            const previousRound = room.game.rounds[0];

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
                room.questionSnapshot?.questions ?? [];

            const nextPosition = previousRound
                ? previousRound.roundNumber
                : 0;

            const nextQuestion = snapshotQuestions.find(
                (question) => question.position === nextPosition,
            );

            if (!nextQuestion) {
                await tx.game.update({
                    where: { id: room.game.id },
                    data: {
                        finishedAt: new Date(),
                    },
                });

                await tx.room.update({
                    where: { id: room.id },
                    data: {
                        status: "FINISHED",
                    },
                });

                return {
                    success: false,
                    reason: "DECK_FINISHED",
                };
            }

            const round = await tx.round.create({
                data: {
                    gameId: room.game.id,
                    snapshotQuestionId: nextQuestion.id,
                    roundNumber: nextPosition + 1,
                    timeLimit: room.questionTime,
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
