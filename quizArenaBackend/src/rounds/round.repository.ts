
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
