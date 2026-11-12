
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Question, QuestionOption } from "@prisma/client";

import { QuestionRepository } from "../../src/questions/question.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        question: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

const questionModel = prisma.question as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};

const questionFixture = {
    id: "question-test-uuid",
    statement: "Qual é a capital do Brasil?",
    roomId: "room-test-uuid",
    type: "MULTIPLE_CHOICE" as const,
    isActive: true,
    createdAt: new Date("2026-11-08T12:00:00.000Z"),
    updatedAt: new Date("2026-11-08T12:00:00.000Z"),
} satisfies Question;

const optionsFixture = [
    {
        id: "option-1",
        text: "Brasília",
        isCorrect: true,
        questionId: questionFixture.id,
    },
    {
        id: "option-2",
        text: "São Paulo",
        isCorrect: false,
        questionId: questionFixture.id,
    },
] satisfies QuestionOption[];

const questionWithOptionsFixture = {
    ...questionFixture,
    options: optionsFixture,
};

const createQuestionData = {
    statement: "Qual é a capital do Brasil?",
    type: "MULTIPLE_CHOICE" as const,
    roomId: "room-test-uuid",
    options: [
        { text: "Brasília", isCorrect: true },
        { text: "São Paulo", isCorrect: false },
    ],
};

describe("QuestionRepository", () => {
    let repository: QuestionRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new QuestionRepository();
    });

    describe("findById", () => {
        it("deve encontrar uma pergunta pelo ID com suas alternativas", async () => {
            questionModel.findUnique.mockResolvedValue(
                questionWithOptionsFixture,
            );

            const result = await repository.findById(questionFixture.id);

            expect(questionModel.findUnique).toHaveBeenCalledWith({
                where: { id: questionFixture.id },
                include: { options: true },
            });

            expect(result).toEqual(questionWithOptionsFixture);
        });

        it("deve retornar null quando a pergunta não existir", async () => {
            questionModel.findUnique.mockResolvedValue(null);

            const result = await repository.findById("invalid-id");

            expect(result).toBeNull();
        });
    });

    describe("findMany", () => {
        it("deve listar perguntas com suas alternativas ordenadas por data", async () => {
            questionModel.findMany.mockResolvedValue([
                questionWithOptionsFixture,
            ]);

            const result = await repository.findMany();

            expect(questionModel.findMany).toHaveBeenCalledWith({
                include: { options: true },
                orderBy: { createdAt: "desc" },
            });

            expect(result).toEqual([questionWithOptionsFixture]);
        });

        it("deve retornar uma lista vazia quando não houver perguntas", async () => {
            questionModel.findMany.mockResolvedValue([]);

            const result = await repository.findMany();

            expect(result).toEqual([]);
        });
    });

    describe("create", () => {
        it("deve criar uma pergunta com suas alternativas", async () => {
            questionModel.create.mockResolvedValue(
                questionWithOptionsFixture,
            );

            const result = await repository.create(createQuestionData);

            expect(questionModel.create).toHaveBeenCalledWith({
                data: {
                    statement: createQuestionData.statement,
                    type: createQuestionData.type,
                    roomId: createQuestionData.roomId,
                    options: {
                        create: createQuestionData.options,
                    },
                },
                include: { options: true },
            });

            expect(result).toEqual(questionWithOptionsFixture);
        });
    });

    describe("update", () => {
        it("deve atualizar os dados da pergunta e substituir suas alternativas", async () => {
            const updateData = {
                statement: "Qual é a capital da França?",
                options: [
                    { text: "Paris", isCorrect: true },
                    { text: "Lyon", isCorrect: false },
                ],
            };

            questionModel.update.mockResolvedValue(
                questionWithOptionsFixture,
            );

            const result = await repository.update(
                questionFixture.id,
                updateData,
            );

            expect(questionModel.update).toHaveBeenCalledWith({
                where: { id: questionFixture.id },
                data: {
                    statement: updateData.statement,
                    options: {
                        deleteMany: {},
                        create: updateData.options,
                    },
                },
                include: { options: true },
            });

            expect(result).toEqual(questionWithOptionsFixture);
        });

        it("não deve substituir as alternativas quando elas não forem informadas", async () => {
            const updateData = {
                statement: "Novo enunciado",
            };

            questionModel.update.mockResolvedValue(
                questionWithOptionsFixture,
            );

            await repository.update(questionFixture.id, updateData);

            expect(questionModel.update).toHaveBeenCalledWith({
                where: { id: questionFixture.id },
                data: {
                    statement: updateData.statement,
                },
                include: { options: true },
            });
        });
    });

    describe("updateStatus", () => {
        it("deve atualizar o status de ativação da pergunta", async () => {
            const inactiveQuestion = {
                ...questionFixture,
                isActive: false,
            };

            questionModel.update.mockResolvedValue(inactiveQuestion);

            const result = await repository.updateStatus(
                questionFixture.id,
                false,
            );

            expect(questionModel.update).toHaveBeenCalledWith({
                where: { id: questionFixture.id },
                data: { isActive: false },
            });

            expect(result).toEqual(inactiveQuestion);
        });
    });
});
