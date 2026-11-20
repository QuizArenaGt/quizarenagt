import type { Request, Response } from "express";

import {
    RoundService,
    buildRoundStartedPayload,
} from "./round.service.js";

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

            const roundPayload = buildRoundStartedPayload(result.round);

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

            res.status(200).json(result.payload);
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
