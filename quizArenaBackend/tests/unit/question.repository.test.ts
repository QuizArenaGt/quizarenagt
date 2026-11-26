
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Question, QuestionOption } from "@prisma/client";

import { QuestionRepository } from "../../src/questions/question.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        $transaction: vi.fn(),
        question: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

const prismaTransactionMock = prisma.$transaction as unknown as ReturnType<
    typeof vi.fn
>;

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
        position: 0,
    },
    {
        id: "option-2",
        text: "São Paulo",
        isCorrect: false,
        questionId: questionFixture.id,
        position: 1,
    },
    {
        id: "option-3",
        text: "Rio de Janeiro",
        isCorrect: false,
        questionId: questionFixture.id,
        position: 2,
    },
    {
        id: "option-4",
        text: "Salvador",
        isCorrect: false,
        questionId: questionFixture.id,
        position: 3,
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
        { text: "Rio de Janeiro", isCorrect: false },
        { text: "Salvador", isCorrect: false },
    ],
};

const optionsWithPositions = createQuestionData.options.map(
    (option, position) => ({
        ...option,
        position,
    }),
);

const orderedOptionsInclude = {
    options: {
        orderBy: { position: "asc" },
    },
};

describe("QuestionRepository", () => {
    let repository: QuestionRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new QuestionRepository();
    });

    describe("findById", () => {
        it("deve encontrar uma pergunta pelo ID com suas alternativas ordenadas por posição", async () => {
            questionModel.findUnique.mockResolvedValue(
                questionWithOptionsFixture,
            );

            const result = await repository.findById(questionFixture.id);

            expect(questionModel.findUnique).toHaveBeenCalledWith({
                where: { id: questionFixture.id },
                include: orderedOptionsInclude,
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
        it("deve listar perguntas com alternativas ordenadas por posição e perguntas por data", async () => {
            questionModel.findMany.mockResolvedValue([
                questionWithOptionsFixture,
            ]);

            const result = await repository.findMany();

            expect(questionModel.findMany).toHaveBeenCalledWith({
                include: orderedOptionsInclude,
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
        it("deve criar uma pergunta com suas alternativas e posições", async () => {
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
                        create: optionsWithPositions,
                    },
                },
                include: orderedOptionsInclude,
            });

            expect(result).toEqual(questionWithOptionsFixture);
        });
    });

    describe("update", () => {
        it("deve atualizar os dados da pergunta e substituir suas alternativas com posições", async () => {
            const updateData = {
                statement: "Qual é a capital da França?",
                options: [
                    { text: "Paris", isCorrect: true },
                    { text: "Lyon", isCorrect: false },
                    { text: "Marselha", isCorrect: false },
                    { text: "Nice", isCorrect: false },
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
                        create: updateData.options.map(
                            (option, position) => ({
                                ...option,
                                position,
                            }),
                        ),
                    },
                },
                include: orderedOptionsInclude,
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
                include: orderedOptionsInclude,
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

    describe("findManyByRoomId", () => {
        it("deve ordenar perguntas da sala por createdAt ASC e desempate determinístico por id ASC", async () => {
            questionModel.findMany.mockResolvedValue([
                questionWithOptionsFixture,
            ]);

            const result = await repository.findManyByRoomId("room-test-uuid");

            expect(questionModel.findMany).toHaveBeenCalledWith({
                where: { roomId: "room-test-uuid" },
                include: orderedOptionsInclude,
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            });
            expect(result).toEqual([questionWithOptionsFixture]);
        });
    });

    describe("importManyToRoom", () => {
        const UUID_V4_REGEX =
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        function createTxMock(options?: {
            room?: {
                id: string;
                hostId: string;
                status: string;
                games: { status: string }[];
            } | null;
            dbNow?: Date;
            latestCreatedAt?: Date | null;
        }) {
            const dbNow =
                options?.dbNow ?? new Date("2026-11-26T10:00:00.000Z");
            const latestCreatedAt =
                options?.latestCreatedAt === undefined
                    ? null
                    : options.latestCreatedAt;
            const room =
                options?.room === undefined
                    ? {
                          id: "room-test-uuid",
                          hostId: "host-test-uuid",
                          status: "ACTIVE",
                          games: [{ status: "WAITING" }],
                      }
                    : options.room;

            const tx = {
                $queryRaw: vi
                    .fn()
                    .mockResolvedValueOnce([{ id: "room-test-uuid" }])
                    .mockResolvedValueOnce([{ now: dbNow, latestCreatedAt }]),
                room: {
                    findUnique: vi.fn().mockResolvedValue(room),
                },
                question: {
                    create: vi.fn(),
                    createManyAndReturn: vi.fn(),
                },
                questionOption: {
                    createManyAndReturn: vi.fn(),
                },
            };

            prismaTransactionMock.mockImplementation(
                async (
                    callback: (client: typeof tx) => Promise<unknown>,
                ) => callback(tx),
            );

            return tx;
        }

        it("deve inserir questões e alternativas em lote com UUIDs associados, timestamps monotônicos e ordem preservada", async () => {
            const dbNow = new Date("2026-11-26T10:00:00.000Z");
            const latestCreatedAt = new Date("2026-11-26T10:00:00.050Z");
            const tx = createTxMock({ dbNow, latestCreatedAt });

            const inputQuestions = [
                {
                    statement: "Pergunta 1",
                    type: "MULTIPLE_CHOICE" as const,
                    options: [
                        { text: "A1", isCorrect: false },
                        { text: "B1", isCorrect: true },
                        { text: "C1", isCorrect: false },
                    ],
                },
                {
                    statement: "Pergunta 2",
                    type: "TRUE_FALSE" as const,
                    options: [
                        { text: "Verdadeiro", isCorrect: true },
                        { text: "Falso", isCorrect: false },
                    ],
                },
            ];

            tx.question.createManyAndReturn.mockImplementation(
                async ({
                    data,
                }: {
                    data: Array<{
                        id: string;
                        statement: string;
                        type: "MULTIPLE_CHOICE" | "TRUE_FALSE";
                        roomId: string;
                        createdAt: Date;
                    }>;
                }) =>
                    // Simula retorno fora de ordem pelo banco para garantir ordenação determinística em memória
                    [...data].reverse().map((row) => ({
                        ...row,
                        isActive: true,
                        updatedAt: row.createdAt,
                    })),
            );

            tx.questionOption.createManyAndReturn.mockImplementation(
                async ({
                    data,
                }: {
                    data: Array<{
                        questionId: string;
                        text: string;
                        isCorrect: boolean;
                        position: number;
                    }>;
                }) =>
                    // Simula retorno embaralhado das opções para garantir agrupamento e ordenação por position
                    [...data].reverse().map((row, idx) => ({
                        id: `opt-${idx + 1}`,
                        ...row,
                    })),
            );

            const result = await repository.importManyToRoom(
                "room-test-uuid",
                "host-test-uuid",
                inputQuestions,
            );

            expect(prismaTransactionMock).toHaveBeenCalledWith(
                expect.any(Function),
                { maxWait: 5000, timeout: 15000 },
            );
            expect(tx.question.create).not.toHaveBeenCalled();
            expect(tx.question.createManyAndReturn).toHaveBeenCalledTimes(1);
            expect(
                tx.questionOption.createManyAndReturn,
            ).toHaveBeenCalledTimes(1);

            const questionPayload =
                tx.question.createManyAndReturn.mock.calls[0]![0].data;
            const optionPayload =
                tx.questionOption.createManyAndReturn.mock.calls[0]![0].data;

            expect(questionPayload).toHaveLength(2);
            expect(questionPayload[0].id).toMatch(UUID_V4_REGEX);
            expect(questionPayload[1].id).toMatch(UUID_V4_REGEX);
            expect(questionPayload[0].id).not.toBe(questionPayload[1].id);
            expect(questionPayload[0].createdAt.getTime()).toBe(
                latestCreatedAt.getTime() + 1,
            );
            expect(questionPayload[1].createdAt.getTime()).toBe(
                latestCreatedAt.getTime() + 2,
            );

            expect(optionPayload).toEqual([
                {
                    questionId: questionPayload[0].id,
                    text: "A1",
                    isCorrect: false,
                    position: 0,
                },
                {
                    questionId: questionPayload[0].id,
                    text: "B1",
                    isCorrect: true,
                    position: 1,
                },
                {
                    questionId: questionPayload[0].id,
                    text: "C1",
                    isCorrect: false,
                    position: 2,
                },
                {
                    questionId: questionPayload[1].id,
                    text: "Verdadeiro",
                    isCorrect: true,
                    position: 0,
                },
                {
                    questionId: questionPayload[1].id,
                    text: "Falso",
                    isCorrect: false,
                    position: 1,
                },
            ]);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.questions.map((q) => q.statement)).toEqual([
                    "Pergunta 1",
                    "Pergunta 2",
                ]);
                expect(result.questions[0]!.id).toBe(questionPayload[0].id);
                expect(
                    result.questions[0]!.options.map((o) => [
                        o.questionId,
                        o.position,
                        o.text,
                    ]),
                ).toEqual([
                    [questionPayload[0].id, 0, "A1"],
                    [questionPayload[0].id, 1, "B1"],
                    [questionPayload[0].id, 2, "C1"],
                ]);
                expect(result.questions[1]!.id).toBe(questionPayload[1].id);
                expect(
                    result.questions[1]!.options.map((o) => [
                        o.questionId,
                        o.position,
                        o.text,
                    ]),
                ).toEqual([
                    [questionPayload[1].id, 0, "Verdadeiro"],
                    [questionPayload[1].id, 1, "Falso"],
                ]);
            }
        });

        it("deve retornar motivo de erro e não inserir nada quando a sala não existir, não pertencer ao host ou não estiver editável", async () => {
            const txNotFound = createTxMock({ room: null });
            await expect(
                repository.importManyToRoom(
                    "room-test-uuid",
                    "host-test-uuid",
                    [createQuestionData],
                ),
            ).resolves.toEqual({ success: false, reason: "ROOM_NOT_FOUND" });
            expect(
                txNotFound.question.createManyAndReturn,
            ).not.toHaveBeenCalled();

            const txDenied = createTxMock({
                room: {
                    id: "room-test-uuid",
                    hostId: "other-host",
                    status: "ACTIVE",
                    games: [{ status: "WAITING" }],
                },
            });
            await expect(
                repository.importManyToRoom(
                    "room-test-uuid",
                    "host-test-uuid",
                    [createQuestionData],
                ),
            ).resolves.toEqual({ success: false, reason: "ACCESS_DENIED" });
            expect(
                txDenied.question.createManyAndReturn,
            ).not.toHaveBeenCalled();

            const txInProgress = createTxMock({
                room: {
                    id: "room-test-uuid",
                    hostId: "host-test-uuid",
                    status: "ACTIVE",
                    games: [{ status: "IN_PROGRESS" }],
                },
            });
            await expect(
                repository.importManyToRoom(
                    "room-test-uuid",
                    "host-test-uuid",
                    [createQuestionData],
                ),
            ).resolves.toEqual({
                success: false,
                reason: "ROOM_NOT_EDITABLE",
            });
            expect(
                txInProgress.question.createManyAndReturn,
            ).not.toHaveBeenCalled();
        });

        it("deve propagar erro quando falhar a inserção em lote das questões", async () => {
            const tx = createTxMock();
            tx.question.createManyAndReturn.mockRejectedValue(
                new Error("Falha ao inserir questões"),
            );

            await expect(
                repository.importManyToRoom(
                    "room-test-uuid",
                    "host-test-uuid",
                    [createQuestionData],
                ),
            ).rejects.toThrow("Falha ao inserir questões");

            expect(
                tx.questionOption.createManyAndReturn,
            ).not.toHaveBeenCalled();
        });

        it("deve propagar erro quando falhar a inserção em lote das alternativas", async () => {
            const tx = createTxMock();
            tx.question.createManyAndReturn.mockImplementation(
                async ({ data }: { data: Array<{ id: string }> }) =>
                    data.map((row) => ({
                        ...row,
                        isActive: true,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })),
            );
            tx.questionOption.createManyAndReturn.mockRejectedValue(
                new Error("Falha ao inserir alternativas"),
            );

            await expect(
                repository.importManyToRoom(
                    "room-test-uuid",
                    "host-test-uuid",
                    [createQuestionData],
                ),
            ).rejects.toThrow("Falha ao inserir alternativas");
        });
    });
});
