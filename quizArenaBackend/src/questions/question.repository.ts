
import type {
    Question,
    QuestionOption,
    QuestionType,
} from "@prisma/client";

import { prisma } from "../database/prisma.js";

type CreateQuestionOptionData = {
    text: string;
    isCorrect: boolean;
};

type CreateQuestionData = {
    statement: string;
    type: QuestionType;
    options: CreateQuestionOptionData[];
};

type UpdateQuestionData = {
    statement?: string;
    type?: QuestionType;
    options?: CreateQuestionOptionData[];
};

type QuestionWithOptions = Question & {
    options: QuestionOption[];
};

export class QuestionRepository {
    async findById(id: string): Promise<QuestionWithOptions | null> {
        return prisma.question.findUnique({
            where: { id },
            include: { options: true },
        });
    }

    async findMany(): Promise<QuestionWithOptions[]> {
        return prisma.question.findMany({
            include: { options: true },
            orderBy: { createdAt: "desc" },
        });
    }

    async create(data: CreateQuestionData): Promise<QuestionWithOptions> {
        return prisma.question.create({
            data: {
                statement: data.statement,
                type: data.type,
                options: {
                    create: data.options,
                },
            },
            include: { options: true },
        });
    }

    async update(
        id: string,
        data: UpdateQuestionData,
    ): Promise<QuestionWithOptions> {
        return prisma.question.update({
            where: { id },
            data: {
                ...(data.statement !== undefined && {
                    statement: data.statement,
                }),
                ...(data.type !== undefined && {
                    type: data.type,
                }),
                ...(data.options !== undefined && {
                    options: {
                        deleteMany: {},
                        create: data.options,
                    },
                }),
            },
            include: { options: true },
        });
    }

    async updateStatus(
        id: string,
        isActive: boolean,
    ): Promise<Question> {
        return prisma.question.update({
            where: { id },
            data: { isActive },
        });
    }
}
