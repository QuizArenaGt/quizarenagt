
import type { Request, Response } from "express";

import { RoundService } from "./round.service.js";

import {
    RoundRoomNotFoundError,
    RoundAccessDeniedError,
    RoundRoomNotInProgressError,
    RoundGameNotFoundError,
    RoundAlreadyOpenError,
    PreviousRoundNotClosedError,
} from "./round.errors.js";

export class RoundController {
    constructor(
        private readonly roundService = new RoundService(),
    ) {}

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
                res.status(200).json({
                    finished: true,
                    message:
                        "Todas as perguntas foram utilizadas. A partida foi finalizada.",
                });
                return;
            }

            const { round } = result;

            res.status(201).json({
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
                        options: round.snapshotQuestion.options.map(
                            (option) => ({
                                id: option.id,
                                text: option.text,
                                position: option.position,
                            }),
                        ),
                    },
                },
            });
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

            console.error("Erro interno ao criar próxima rodada.");

            res.status(500).json({
                message: "Erro interno ao criar próxima rodada.",
            });
        }
    }
}
