
import type { RoundAnswer } from "@prisma/client";

import { prisma } from "../database/prisma.js";

export type SubmitRoundAnswerResult =
    | {
        success: true;
        answer: RoundAnswer;
    }
    | {
        success: false;
        reason:
        | "ROUND_NOT_FOUND"
        | "PLAYER_NOT_IN_ROOM"
        | "ROUND_NOT_OPEN"
        | "GAME_NOT_IN_PROGRESS"
        | "OPTION_NOT_VALID"
        | "ALREADY_ANSWERED"
        | "ROUND_TIME_EXPIRED";
    };

export class RoundAnswerRepository {
    async submitAnswer(
        roundId: string,
        roomPlayerId: string,
        optionId: string,
    ): Promise<SubmitRoundAnswerResult> {
        return prisma.$transaction(async (tx) => {
            // Serializa envios simultâneos para a mesma rodada.
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
                            room: true,
                        },
                    },
                    snapshotQuestion: {
                        include: {
                            options: true,
                        },
                    },
                },
            });

            if (!round) {
                return {
                    success: false,
                    reason: "ROUND_NOT_FOUND",
                };
            }

            const player = await tx.roomPlayer.findUnique({
                where: { id: roomPlayerId },
                select: {
                    roomId: true,
                },
            });

            if (!player || player.roomId !== round.game.roomId) {
                return {
                    success: false,
                    reason: "PLAYER_NOT_IN_ROOM",
                };
            }

            if (round.status !== "OPEN") {
                return {
                    success: false,
                    reason: "ROUND_NOT_OPEN",
                };
            }

            if (
                round.game.finishedAt !== null ||
                round.game.room.status !== "IN_PROGRESS"
            ) {
                return {
                    success: false,
                    reason: "GAME_NOT_IN_PROGRESS",
                };
            }

            const option = round.snapshotQuestion.options.find(
                (item) => item.id === optionId,
            );

            if (!option) {
                return {
                    success: false,
                    reason: "OPTION_NOT_VALID",
                };
            }

            const existingAnswer = await tx.roundAnswer.findUnique({
                where: {
                    roundId_roomPlayerId: {
                        roundId,
                        roomPlayerId,
                    },
                },
            });

            if (existingAnswer) {
                return {
                    success: false,
                    reason: "ALREADY_ANSWERED",
                };
            }

            const answeredAt = new Date();
            const totalTimeMs = round.timeLimit * 1000;
            const elapsedTimeMs =
                answeredAt.getTime() - round.openedAt.getTime();

            if (elapsedTimeMs >= totalTimeMs) {
                return {
                    success: false,
                    reason: "ROUND_TIME_EXPIRED",
                };
            }

            const remainingTimeMs = Math.max(
                0,
                totalTimeMs - elapsedTimeMs,
            );

            const speedBonus = Math.round(
                50 * (remainingTimeMs / totalTimeMs),
            );

            const points = option.isCorrect
                ? 100 + speedBonus
                : round.game.room.gameMode === "HARDCORE"
                    ? -30
                    : 0;

            const answer = await tx.roundAnswer.create({
                data: {
                    roundId,
                    roomPlayerId,
                    optionId,
                    isCorrect: option.isCorrect,
                    answeredAt,
                    points,
                },
            });

            await tx.roomPlayer.update({
                where: { id: roomPlayerId },
                data: {
                    score: {
                        increment: points,
                    },
                },
            });

            return {
                success: true,
                answer,
            };
        });
    }
}
