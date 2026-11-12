import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionType, type Question, type QuestionOption } from "@prisma/client";

import { QuestionService } from "../../src/questions/question.service.js";
import { InvalidQuestionDataError } from "../../src/questions/question.errors.js";
import type { QuestionRepository } from "../../src/questions/question.repository.js";
import type { CreateQuestionDto } from "../../src/questions/create-question.dto.js";

type Repository = Pick<QuestionRepository, "create">;

const validData: CreateQuestionDto = {
    statement: "Qual é a capital do Brasil?",
    type: QuestionType.MULTIPLE_CHOICE,
    options: [
        { text: "Brasília", isCorrect: true },
        { text: "São Paulo", isCorrect: false },
        { text: "Rio de Janeiro", isCorrect: false },
        { text: "Salvador", isCorrect: false },
    ],
};

const questionFixture: Question & { options: QuestionOption[] } = {
    id: "question-test-uuid",
    statement: validData.statement,
    type: validData.type,
    isActive: true,
    createdAt: new Date("2026-11-12T12:00:00.000Z"),
    updatedAt: new Date("2026-11-12T12:00:00.000Z"),
    options: validData.options.map((opt, index) => ({
        id: `option-${index + 1}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
        questionId: "question-test-uuid",
    })),
};

describe("QuestionService", () => {
    let repository: {
        create: ReturnType<typeof vi.fn>;
    };
    let service: QuestionService;

    beforeEach(() => {
        repository = {
            create: vi.fn(),
        };

        service = new QuestionService(repository as Repository);
    });

    it("deve criar uma pergunta com 4 alternativas e 1 correta", async () => {
        repository.create.mockResolvedValue(questionFixture);

        const result = await service.createQuestion(validData);

        expect(repository.create).toHaveBeenCalledTimes(1);
        expect(repository.create).toHaveBeenCalledWith({
            statement: validData.statement,
            type: QuestionType.MULTIPLE_CHOICE,
            options: validData.options,
        });
        expect(result).toEqual(questionFixture);
    });

    it("deve rejeitar criação quando o enunciado for vazio", async () => {
        await expect(
            service.createQuestion({
                ...validData,
                statement: "   ",
            }),
        ).rejects.toBeInstanceOf(InvalidQuestionDataError);

        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve rejeitar criação quando não houver exatamente 4 alternativas", async () => {
        await expect(
            service.createQuestion({
                ...validData,
                options: validData.options.slice(0, 2),
            }),
        ).rejects.toBeInstanceOf(InvalidQuestionDataError);

        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve rejeitar criação quando não houver exatamente 1 alternativa correta", async () => {
        await expect(
            service.createQuestion({
                ...validData,
                options: validData.options.map((opt) => ({
                    ...opt,
                    isCorrect: false,
                })),
            }),
        ).rejects.toBeInstanceOf(InvalidQuestionDataError);

        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve propagar erros inesperados do repositório", async () => {
        const databaseError = new Error("Falha de conexão com o banco");
        repository.create.mockRejectedValue(databaseError);

        await expect(service.createQuestion(validData)).rejects.toBe(
            databaseError,
        );
    });
});
