
import type { Request, Response } from "express";
import { QuestionService } from "./question.service.js";
import {
    InvalidQuestionDataError,
    QuestionRoomAccessDeniedError,
    QuestionRoomNotFoundError,
} from "./question.errors.js";

export class QuestionController {
    constructor(
        private readonly questionService = new QuestionService(),
    ) {}

    async create(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        try {
            const question = await this.questionService.createQuestion({
                ...req.body,
                hostId: req.user.id,
            });

            res.status(201).json(question);
        } catch (error: unknown) {
            if (error instanceof InvalidQuestionDataError) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors: error.errors,
                });
                return;
            }

            if (error instanceof QuestionRoomNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof QuestionRoomAccessDeniedError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao criar pergunta.");

            res.status(500).json({
                message: "Erro interno ao criar pergunta.",
            });
        }
    }
}
