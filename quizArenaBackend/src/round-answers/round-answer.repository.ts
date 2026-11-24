
import type { GameMode, RoundAnswer } from "@prisma/client";

import { prisma } from "../database/prisma.js";
import { isGamePlayerActive } from "../rooms/game-player-eligibility.js";
import { getPlayerPresenceRegistry } from "../realtime/room-events.js";
import { getServerNowDate } from "../realtime/server-clock.js";

export const BASE_CORRECT_POINTS = 100;
export const MAX_SPEED_BONUS_POINTS = 100;
export const CLASSIC_WRONG_POINTS = 0;
export const HARDCORE_WRONG_POINTS = -30;

export interface CalculateRoundAnswerPointsParams {
    isCorrect: boolean;
    gameMode: GameMode;
    openedAt: Date;
    expiresAt: Date;
    answeredAt: Date;
}

/**
 * Calcula os pontos de uma resposta exclusivamente no servidor:
 * acerto = 100 base + bônus proporcional ao tempo restante (até +100);
 * erro = 0 no modo CLASSIC e -30 no modo HARDCORE, sem limite inferior no placar.
 */
export function calculateRoundAnswerPoints({
    isCorrect,
    gameMode,
    openedAt,
    expiresAt,
    answeredAt,
}: CalculateRoundAnswerPointsParams): number {
    if (!isCorrect) {
        return gameMode === "HARDCORE"
            ? HARDCORE_WRONG_POINTS
            : CLASSIC_WRONG_POINTS;
    }

    const totalTimeMs = Math.max(1, expiresAt.getTime() - openedAt.getTime());
    const remainingTimeMs = Math.max(
        0,
        expiresAt.getTime() - answeredAt.getTime(),
    );
    const speedRatio = Math.min(1, Math.max(0, remainingTimeMs / totalTimeMs));
    const speedBonus = Math.round(MAX_SPEED_BONUS_POINTS * speedRatio);

    return BASE_CORRECT_POINTS + speedBonus;
}

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
        | "PLAYER_INACTIVE"
        | "ROUND_NOT_OPEN"
        | "GAME_NOT_IN_PROGRESS"
        | "OPTION_NOT_VALID"
        | "ALREADY_ANSWERED"
        | "ROUND_TIME_EXPIRED";
    };

export class RoundAnswerRepository {
    async submitAnswer(
        roundId: string,
        gamePlayerId: string,
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
                            room: {
                                select: {
                                    id: true,
                                    status: true,
                                },
                            },
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

            const player = await tx.gamePlayer.findUnique({
                where: { id: gamePlayerId },
                select: {
                    gameId: true,
                    status: true,
                    reconnectDeadlineAt: true,
                },
            });

            if (!player || player.gameId !== round.gameId) {
                return {
                    success: false,
                    reason: "PLAYER_NOT_IN_ROOM",
                };
            }

            if (!isGamePlayerActive(player)) {
                return {
                    success: false,
                    reason: "PLAYER_INACTIVE",
                };
            }

            if (
                player.reconnectDeadlineAt instanceof Date &&
                (getPlayerPresenceRegistry()?.getActiveSocketCount(
                    gamePlayerId,
                ) ?? 0) === 0
            ) {
                const currentNow = getServerNowDate();

                if (player.reconnectDeadlineAt.getTime() <= currentNow.getTime()) {
                    return {
                        success: false,
                        reason: "PLAYER_INACTIVE",
                    };
                }
            }

            if (round.status !== "OPEN") {
                return {
                    success: false,
                    reason: "ROUND_NOT_OPEN",
                };
            }

            if (
                round.game.finishedAt !== null ||
                round.game.status !== "IN_PROGRESS" ||
                round.game.room.status !== "ACTIVE"
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
                    roundId_gamePlayerId: {
                        roundId,
                        gamePlayerId,
                    },
                },
            });

            if (existingAnswer) {
                return {
                    success: false,
                    reason: "ALREADY_ANSWERED",
                };
            }

            const answeredAt = getServerNowDate();

            const expiresAt =
                round.expiresAt ??
                new Date(round.openedAt.getTime() + round.timeLimit * 1000);

            if (answeredAt.getTime() >= expiresAt.getTime()) {
                return {
                    success: false,
                    reason: "ROUND_TIME_EXPIRED",
                };
            }

            const points = calculateRoundAnswerPoints({
                isCorrect: option.isCorrect,
                gameMode: round.game.gameMode,
                openedAt: round.openedAt,
                expiresAt,
                answeredAt,
            });

            const answer = await tx.roundAnswer.create({
                data: {
                    roundId,
                    gamePlayerId,
                    optionId,
                    isCorrect: option.isCorrect,
                    answeredAt,
                    points,
                },
            });

            await tx.gamePlayer.update({
                where: { id: gamePlayerId },
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
