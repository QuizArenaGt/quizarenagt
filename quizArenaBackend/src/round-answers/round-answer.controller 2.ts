
import type { Request, Response } from "express";
import { RoundAnswerService } from "./round-answer.service.js";
import { validateSubmitRoundAnswer } from "./submit-round-answer.dto.js";
import { emitRoomEvent } from "../realtime/room-events.js";

import {
    RoundAnswerAlreadySubmittedError,
    RoundAnswerGameNotInProgressError,
    RoundAnswerOptionNotValidError,
    RoundAnswerPlayerNotInRoomError,
    RoundAnswerRoundNotFoundError,
    RoundAnswerRoundNotOpenError,
    RoundAnswerTimeExpiredError,
} from "./round-answer.errors.js";

export class RoundAnswerController {
    constructor(
        private readonly roundAnswerService = new RoundAnswerService(),
    ) { }

    async submit(req: Request, res: Response): Promise<void> {
        if (!req.roomPlayer) {
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

        const validation = validateSubmitRoundAnswer(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: "Dados da resposta inválidos.",
                errors: validation.errors,
            });
            return;
        }

        try {
            const answer = await this.roundAnswerService.submitAnswer(
                roundId,
                req.roomPlayer.id,
                validation.data.optionId,
            );

            emitRoomEvent(req.roomPlayer.roomId, "round:answer-submitted", {
                roundId: answer.roundId,
                player: {
                    id: req.roomPlayer.id,
                    nickname: req.roomPlayer.nickname,
                },
            }); 

            res.status(201).json({
                answer: {
                    id: answer.id,
                    roundId: answer.roundId,
                    answeredAt: answer.answeredAt,
                },
            });
        } catch (error: unknown) {
            if (error instanceof RoundAnswerRoundNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoundAnswerPlayerNotInRoomError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            if (
                error instanceof RoundAnswerRoundNotOpenError ||
                error instanceof RoundAnswerGameNotInProgressError ||
                error instanceof RoundAnswerOptionNotValidError ||
                error instanceof RoundAnswerAlreadySubmittedError ||
                error instanceof RoundAnswerTimeExpiredError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao registrar resposta.");

            res.status(500).json({
                message: "Erro interno ao registrar resposta.",
            });
        }
    }
}
