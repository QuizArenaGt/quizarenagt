
import type { Request, Response } from "express";
import { QuestionService } from "./question.service.js";
import {
    InvalidQuestionDataError,
    QuestionRoomAccessDeniedError,
    QuestionRoomNotFoundError,
    QuestionRoomNotEditableError,
    QuestionNotFoundError,
} from "./question.errors.js";

export class QuestionController {
    constructor(
        private readonly questionService = new QuestionService(),
    ) {}

    async list(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.query.roomId;

        if (typeof roomId !== "string" || !roomId.trim()) {
            res.status(400).json({
                message: "Identificador da sala obrigatório.",
                errors: {
                    roomId: "O identificador da sala é obrigatório.",
                },
            });
            return;
        }

        try {
            const questions = await this.questionService.listQuestions(
                roomId,
                req.user.id,
            );

            res.status(200).json(questions);
        } catch (error: unknown) {
            if (error instanceof InvalidQuestionDataError) {
                res.status(400).json({
                    message: error.message,
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

            console.error("Erro interno ao listar perguntas:", error);

            res.status(500).json({
                message: "Erro interno ao listar perguntas.",
            });
        }
    }

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

            if (error instanceof QuestionRoomNotEditableError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao criar pergunta:", error);

            res.status(500).json({
                message: "Erro interno ao criar pergunta.",
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const questionId = req.params.id;

        if (typeof questionId !== "string" || !questionId.trim()) {
            res.status(400).json({
                message: "Identificador da pergunta obrigatório.",
            });
            return;
        }

        try {
            const question = await this.questionService.updateQuestion(
                questionId,
                req.user.id,
                req.body,
            );

            res.status(200).json(question);
        } catch (error: unknown) {
            if (error instanceof InvalidQuestionDataError) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors: error.errors,
                });
                return;
            }

            if (
                error instanceof QuestionNotFoundError ||
                error instanceof QuestionRoomNotFoundError
            ) {
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

            if (error instanceof QuestionRoomNotEditableError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao atualizar pergunta:", error);

            res.status(500).json({
                message: "Erro interno ao atualizar pergunta.",
            });
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const questionId = req.params.id;

        if (typeof questionId !== "string" || !questionId.trim()) {
            res.status(400).json({
                message: "Identificador da pergunta obrigatório.",
            });
            return;
        }

        try {
            await this.questionService.deleteQuestion(
                questionId,
                req.user.id,
            );

            res.status(200).json({
                message: "Pergunta excluída com sucesso.",
            });
        } catch (error: unknown) {
            if (
                error instanceof QuestionNotFoundError ||
                error instanceof QuestionRoomNotFoundError
            ) {
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

            if (error instanceof QuestionRoomNotEditableError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao excluir pergunta:", error);

            res.status(500).json({
                message: "Erro interno ao excluir pergunta.",
            });
        }
    }
}
