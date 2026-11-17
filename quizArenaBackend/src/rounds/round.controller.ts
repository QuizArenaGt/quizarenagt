
import type { Request, Response } from "express";

import { RoundService } from "./round.service.js";

import {
    RoundRoomNotFoundError,
    RoundAccessDeniedError,
    RoundRoomNotInProgressError,
    RoundGameNotFoundError,
    RoundAlreadyOpenError,
    PreviousRoundNotClosedError,
    RoundNotReadyError,
    RoundNotFoundError,
} from "./round.errors.js";
import { emitRoomEvent } from "../realtime/room-events.js";

export class RoundController {
    constructor(
        private readonly roundService = new RoundService(),
    ) { }

    async createNext(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.params.id;

        if (typeof roomId !== "string") {
            res.status(400).json({
                message: "Identificador da sala inválido.",
            });
            return;
        }

        try {
            const result = await this.roundService.createNextRound(
                roomId,
                req.user.id,
            );

            if (result.finished) {
                emitRoomEvent(roomId, "game:finished", {
                    roomId,
                });

                res.status(200).json({
                    finished: true,
                    message:
                        "Todas as perguntas foram utilizadas. A partida foi finalizada.",
                });
                return;
            }

            const { round } = result;

            const roundPayload = {
                finished: false,
                round: {
                    id: round.id,
                    roundNumber: round.roundNumber,
                    status: round.status,
                    openedAt: round.openedAt,
                    timeLimit: round.timeLimit,
                    question: {
                        id: round.snapshotQuestion.id,
                        statement: round.snapshotQuestion.statement,
                        type: round.snapshotQuestion.type,
                        position: round.snapshotQuestion.position,
                        options: round.snapshotQuestion.options.map((option) => ({
                            id: option.id,
                            text: option.text,
                            position: option.position,
                        })),
                    },
                },
            };

            emitRoomEvent(roomId, "round:started", roundPayload);

            res.status(201).json(roundPayload);

        } catch (error: unknown) {
            if (error instanceof RoundRoomNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoundAccessDeniedError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            if (
                error instanceof RoundRoomNotInProgressError ||
                error instanceof RoundGameNotFoundError ||
                error instanceof RoundAlreadyOpenError ||
                error instanceof PreviousRoundNotClosedError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao criar próxima rodada.", error);

            res.status(500).json({
                message: "Erro interno ao criar próxima rodada.",
            });
        }
    }

    async close(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roundId = req.params.id;

        if (typeof roundId !== "string") {
            res.status(400).json({
                message: "Identificador da rodada inválido.",
            });
            return;
        }

        try {
            const result = await this.roundService.closeRound(
                roundId,
                req.user.id,
            );

            const round = result.round;

            const answeredPlayerIds = new Set(
                round.answers.map((answer) => answer.roomPlayer.id),
            );

            const ranking = [...round.game.room.players]
                .sort((a, b) => b.score - a.score)
                .map((player) => ({
                    id: player.id,
                    nickname: player.nickname,
                    score: player.score,
                }));

            const response = {
                round: {
                    id: round.id,
                    roundNumber: round.roundNumber,
                    status: round.status,
                    openedAt: round.openedAt,
                    closedAt: round.closedAt,
                    question: {
                        id: round.snapshotQuestion.id,
                        statement: round.snapshotQuestion.statement,
                        options: round.snapshotQuestion.options.map((option) => ({
                            id: option.id,
                            text: option.text,
                            isCorrect: option.isCorrect,
                        })),
                    },
                    answers: round.answers.map((answer) => ({
                        id: answer.id,
                        player: {
                            id: answer.roomPlayer.id,
                            nickname: answer.roomPlayer.nickname,
                        },
                        option: {
                            id: answer.option.id,
                            text: answer.option.text,
                        },
                        isCorrect: answer.isCorrect,
                        points: answer.points,
                        answeredAt: answer.answeredAt,
                    })),
                    unansweredPlayers: round.game.room.players
                        .filter((player) => !answeredPlayerIds.has(player.id))
                        .map((player) => ({
                            id: player.id,
                            nickname: player.nickname,
                        })),
                    ranking,
                },
            };

            emitRoomEvent(round.game.room.id, "round:closed", response);

            res.status(200).json(response);
            
        } catch (error: unknown) {
            if (error instanceof RoundNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoundAccessDeniedError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            if (
                error instanceof RoundRoomNotInProgressError ||
                error instanceof RoundNotReadyError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao encerrar a rodada.", error);

            res.status(500).json({
                message: "Erro interno ao encerrar a rodada.",
            });
        }
    }
}
