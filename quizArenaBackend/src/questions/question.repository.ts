
import { randomUUID } from "node:crypto";
import type {
    Prisma,
    Question,
    QuestionOption,
    QuestionType,
} from "@prisma/client";

import { prisma } from "../database/prisma.js";
import { selectCurrentGame } from "../rooms/room.repository.js";

const IMPORT_QUESTIONS_TRANSACTION_OPTIONS = {
    maxWait: 5000,
    timeout: 15000,
} as const;

type CreateQuestionOptionData = {
    text: string;
    isCorrect: boolean;
};

type CreateQuestionData = {
    statement: string;
    type: QuestionType;
    roomId: string;
    options: CreateQuestionOptionData[];
};

type ImportQuestionItemData = {
    statement: string;
    type: QuestionType;
    options: CreateQuestionOptionData[];
};

type UpdateQuestionData = {
    statement?: string;
    type?: QuestionType;
    options?: CreateQuestionOptionData[];
};

export type QuestionWithOptions = Question & {
    options: QuestionOption[];
};

export type QuestionRoomMutationFailureReason =
    | "QUESTION_NOT_FOUND"
    | "ROOM_NOT_FOUND"
    | "ACCESS_DENIED"
    | "ROOM_NOT_EDITABLE";

export type CreateQuestionInRoomResult =
    | {
        success: true;
        question: QuestionWithOptions;
    }
    | {
        success: false;
        reason: Exclude<
            QuestionRoomMutationFailureReason,
            "QUESTION_NOT_FOUND"
        >;
    };

export type UpdateQuestionInRoomResult =
    | {
        success: true;
        question: QuestionWithOptions;
    }
    | {
        success: false;
        reason: QuestionRoomMutationFailureReason;
    };

export type DeleteQuestionInRoomResult =
    | {
        success: true;
        question: Question;
    }
    | {
        success: false;
        reason: QuestionRoomMutationFailureReason;
    };

export type ImportQuestionsToRoomResult =
    | {
        success: true;
        questions: QuestionWithOptions[];
    }
    | {
        success: false;
        reason: Exclude<
            QuestionRoomMutationFailureReason,
            "QUESTION_NOT_FOUND"
        >;
    };

export class QuestionRepository {
    async findById(id: string): Promise<QuestionWithOptions | null> {
        return prisma.question.findUnique({
            where: { id },
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
        });
    }

    async findMany(): Promise<QuestionWithOptions[]> {
        return prisma.question.findMany({
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async create(data: CreateQuestionData): Promise<QuestionWithOptions> {
        return prisma.question.create({
            data: {
                statement: data.statement,
                type: data.type,
                roomId: data.roomId,
                options: {
                    create: data.options.map((option, position) => ({
                        ...option,
                        position,
                    })),
                },
            },
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
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
                        create: data.options.map((option, position) => ({
                            ...option,
                            position,
                        })),
                    },
                }),
            },
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
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

    async findManyByRoomId(roomId: string): Promise<QuestionWithOptions[]> {
        return prisma.question.findMany({
            where: {
                roomId,
            },
            include: {
                options: {
                    orderBy: {
                        position: "asc",
                    },
                },
            },
            orderBy: [
                { createdAt: "asc" },
                { id: "asc" },
            ],
        });
    }

    async delete(id: string): Promise<Question> {
        return prisma.question.delete({
            where: { id },
        });
    }

    private async lockAndValidateEditableRoomTx(
        tx: Prisma.TransactionClient,
        roomId: string,
        hostId: string,
    ): Promise<
        | { editable: true }
        | {
            editable: false;
            reason: Exclude<
                QuestionRoomMutationFailureReason,
                "QUESTION_NOT_FOUND"
            >;
        }
    > {
        await tx.$queryRaw`
            SELECT id
            FROM rooms
            WHERE id = ${roomId}
            FOR UPDATE
        `;

        const room = await tx.room.findUnique({
            where: { id: roomId },
            select: {
                id: true,
                hostId: true,
                status: true,
                games: {
                    select: {
                        status: true,
                    },
                    orderBy: [
                        { createdAt: "desc" },
                        { id: "desc" },
                    ],
                },
            },
        });

        if (!room) {
            return {
                editable: false,
                reason: "ROOM_NOT_FOUND",
            };
        }

        if (room.hostId !== hostId) {
            return {
                editable: false,
                reason: "ACCESS_DENIED",
            };
        }

        const currentGame = selectCurrentGame(room.games);

        if (
            room.status !== "ACTIVE" ||
            currentGame?.status === "IN_PROGRESS"
        ) {
            return {
                editable: false,
                reason: "ROOM_NOT_EDITABLE",
            };
        }

        return { editable: true };
    }

    private async resolveNextQuestionBaseTimestampMsTx(
        tx: Prisma.TransactionClient,
        roomId: string,
    ): Promise<number> {
        const rows = await tx.$queryRaw<
            { now: Date; latestCreatedAt: Date | null }[]
        >`
            SELECT
                NOW() AS now,
                (
                    SELECT "createdAt"
                    FROM questions
                    WHERE "roomId" = ${roomId}
                    ORDER BY "createdAt" DESC, id DESC
                    LIMIT 1
                ) AS "latestCreatedAt"
        `;

        const row = Array.isArray(rows) ? rows[0] : undefined;
        const dbNow = row?.now instanceof Date ? row.now : new Date();
        const latestCreatedAt =
            row?.latestCreatedAt instanceof Date ? row.latestCreatedAt : null;

        return Math.max(
            dbNow.getTime(),
            (latestCreatedAt?.getTime() ?? 0) + 1,
        );
    }

    /**
     * Cria uma pergunta individual sob lock transacional da sala (`rooms FOR UPDATE`)
     * e timestamp monotônico após a última pergunta da sala.
     */
    async createInRoom(
        roomId: string,
        hostId: string,
        data: ImportQuestionItemData,
    ): Promise<CreateQuestionInRoomResult> {
        return prisma.$transaction(async (tx) => {
            const roomCheck = await this.lockAndValidateEditableRoomTx(
                tx,
                roomId,
                hostId,
            );

            if (!roomCheck.editable) {
                return {
                    success: false,
                    reason: roomCheck.reason,
                };
            }

            const baseTimestampMs =
                await this.resolveNextQuestionBaseTimestampMsTx(tx, roomId);

            const question = await tx.question.create({
                data: {
                    statement: data.statement,
                    type: data.type,
                    roomId,
                    createdAt: new Date(baseTimestampMs),
                    options: {
                        create: data.options.map((option, position) => ({
                            ...option,
                            position,
                        })),
                    },
                },
                include: {
                    options: {
                        orderBy: { position: "asc" },
                    },
                },
            });

            return {
                success: true,
                question,
            };
        });
    }

    /**
     * Atualiza uma pergunta sob lock transacional da sala (`rooms FOR UPDATE`),
     * garantindo que não ocorra corrida com início ou arquivamento.
     */
    async updateInRoom(
        questionId: string,
        hostId: string,
        data: UpdateQuestionData,
    ): Promise<UpdateQuestionInRoomResult> {
        return prisma.$transaction(async (tx) => {
            const target = await tx.question.findUnique({
                where: { id: questionId },
                select: { id: true, roomId: true },
            });

            if (!target) {
                return {
                    success: false,
                    reason: "QUESTION_NOT_FOUND",
                };
            }

            const roomCheck = await this.lockAndValidateEditableRoomTx(
                tx,
                target.roomId,
                hostId,
            );

            if (!roomCheck.editable) {
                return {
                    success: false,
                    reason: roomCheck.reason,
                };
            }

            const stillExists = await tx.question.findUnique({
                where: { id: questionId },
                select: { id: true },
            });

            if (!stillExists) {
                return {
                    success: false,
                    reason: "QUESTION_NOT_FOUND",
                };
            }

            const question = await tx.question.update({
                where: { id: questionId },
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
                            create: data.options.map((option, position) => ({
                                ...option,
                                position,
                            })),
                        },
                    }),
                },
                include: {
                    options: {
                        orderBy: { position: "asc" },
                    },
                },
            });

            return {
                success: true,
                question,
            };
        });
    }

    /**
     * Remove uma pergunta sob lock transacional da sala (`rooms FOR UPDATE`).
     */
    async deleteInRoom(
        questionId: string,
        hostId: string,
    ): Promise<DeleteQuestionInRoomResult> {
        return prisma.$transaction(async (tx) => {
            const target = await tx.question.findUnique({
                where: { id: questionId },
                select: { id: true, roomId: true },
            });

            if (!target) {
                return {
                    success: false,
                    reason: "QUESTION_NOT_FOUND",
                };
            }

            const roomCheck = await this.lockAndValidateEditableRoomTx(
                tx,
                target.roomId,
                hostId,
            );

            if (!roomCheck.editable) {
                return {
                    success: false,
                    reason: roomCheck.reason,
                };
            }

            const stillExists = await tx.question.findUnique({
                where: { id: questionId },
                select: { id: true },
            });

            if (!stillExists) {
                return {
                    success: false,
                    reason: "QUESTION_NOT_FOUND",
                };
            }

            const question = await tx.question.delete({
                where: { id: questionId },
            });

            return {
                success: true,
                question,
            };
        });
    }

    /**
     * Importa perguntas em lote para uma sala dentro de uma única transação com lock na linha de `rooms`,
     * evitando corrida com `startIfReady` e preservando a ordem exata via timestamps monotônicos.
     */
    async importManyToRoom(
        roomId: string,
        hostId: string,
        questions: ImportQuestionItemData[],
    ): Promise<ImportQuestionsToRoomResult> {
        return prisma.$transaction(
            async (tx) => {
                const roomCheck = await this.lockAndValidateEditableRoomTx(
                    tx,
                    roomId,
                    hostId,
                );

                if (!roomCheck.editable) {
                    return {
                        success: false,
                        reason: roomCheck.reason,
                    };
                }

                if (questions.length === 0) {
                    return {
                        success: true,
                        questions: [],
                    };
                }

                const baseTimestampMs =
                    await this.resolveNextQuestionBaseTimestampMsTx(tx, roomId);

                const questionRows: (Prisma.QuestionCreateManyInput & {
                    id: string;
                })[] = [];
                const optionRows: Prisma.QuestionOptionCreateManyInput[] = [];

                for (const [index, question] of questions.entries()) {
                    const questionId = randomUUID();

                    questionRows.push({
                        id: questionId,
                        statement: question.statement,
                        type: question.type,
                        roomId,
                        createdAt: new Date(baseTimestampMs + index),
                    });

                    for (const [position, option] of question.options.entries()) {
                        optionRows.push({
                            questionId,
                            text: option.text,
                            isCorrect: option.isCorrect,
                            position,
                        });
                    }
                }

                const createdQuestions =
                    await tx.question.createManyAndReturn({
                        data: questionRows,
                    });

                const createdOptions =
                    optionRows.length > 0
                        ? await tx.questionOption.createManyAndReturn({
                              data: optionRows,
                          })
                        : [];

                const optionsByQuestionId = new Map<string, QuestionOption[]>();

                for (const option of createdOptions) {
                    const existing = optionsByQuestionId.get(option.questionId);
                    if (existing) {
                        existing.push(option);
                    } else {
                        optionsByQuestionId.set(option.questionId, [option]);
                    }
                }

                const createdQuestionsById = new Map(
                    createdQuestions.map((question) => [question.id, question]),
                );

                const assembledQuestions: QuestionWithOptions[] =
                    questionRows.map((row) => {
                        const createdQuestion = createdQuestionsById.get(row.id);

                        if (!createdQuestion) {
                            throw new Error(
                                `Pergunta inserida não encontrada no retorno em lote: ${row.id}`,
                            );
                        }

                        const options = (
                            optionsByQuestionId.get(createdQuestion.id) ?? []
                        ).sort((a, b) => a.position - b.position);

                        return {
                            ...createdQuestion,
                            options,
                        };
                    });

                return {
                    success: true,
                    questions: assembledQuestions,
                };
            },
            IMPORT_QUESTIONS_TRANSACTION_OPTIONS,
        );
    }

}
