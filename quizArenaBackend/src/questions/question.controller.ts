import type { Request, Response } from "express";
import { QuestionService } from "./question.service.js";
import { validateCreateQuestion } from "./create-question.dto.js";
import { InvalidQuestionDataError } from "./question.errors.js";

export class QuestionController {
    constructor(
        private readonly questionService = new QuestionService(),
    ) {}

    async create(req: Request, res: Response): Promise<void> {
        const validation = validateCreateQuestion(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: "Dados inválidos.",
                errors: validation.errors,
            });
            return;
        }

        try {
            const question = await this.questionService.createQuestion(
                validation.data,
            );

            res.status(201).json(question);
        } catch (error: unknown) {
            if (error instanceof InvalidQuestionDataError) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors: error.errors,
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
