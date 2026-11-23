
import type {
    Prisma,
    Question,
    QuestionOption,
    QuestionType,
} from "@prisma/client";

import { prisma } from "../database/prisma.js";
import { selectCurrentGame } from "../rooms/room.repository.js";

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
            include: {
                games: {
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
        const latestQuestion = await tx.question.findFirst({
            where: { roomId },
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" },
            ],
            select: { createdAt: true },
        });

        const rows = await tx.$queryRaw<{ now: Date }[]>`
            SELECT NOW() AS now
        `;
        const dbNow =
            Array.isArray(rows) && rows[0]?.now instanceof Date
                ? rows[0].now
                : new Date();

        return Math.max(
            dbNow.getTime(),
            (latestQuestion?.createdAt.getTime() ?? 0) + 1,
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

            const createdQuestions: QuestionWithOptions[] = [];

            for (const [index, question] of questions.entries()) {
                const createdAt = new Date(baseTimestampMs + index);

                const created = await tx.question.create({
                    data: {
                        statement: question.statement,
                        type: question.type,
                        roomId,
                        createdAt,
                        options: {
                            create: question.options.map(
                                (option, position) => ({
                                    ...option,
                                    position,
                                }),
                            ),
                        },
                    },
                    include: {
                        options: {
                            orderBy: { position: "asc" },
                        },
                    },
                });

                createdQuestions.push(created);
            }

            return {
                success: true,
                questions: createdQuestions,
            };
        });
    }

}
