import { QuestionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionService } from "../../src/questions/question.service.js";
import {
    InvalidQuestionDataError,
    QuestionNotFoundError,
    QuestionRoomAccessDeniedError,
    QuestionRoomNotEditableError,
    QuestionRoomNotFoundError,
} from "../../src/questions/question.errors.js";

describe("QuestionService", () => {
    const baseDate = new Date("2026-11-18T12:00:00.000Z");

    const baseGameFixture = {
        id: "game-test-uuid",
        roomId: "room-test-uuid",
        status: "WAITING" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        startedAt: null,
        finishedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        players: [],
    };

    const roomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        name: "Sala de História",
        theme: "História",
        hostId: "user-host-uuid",
        status: "ACTIVE" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        archivedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        games: [baseGameFixture],
    };

    const validOptions = [
        { text: "Brasília", isCorrect: true },
        { text: "Rio de Janeiro", isCorrect: false },
    ];

    const questionFixture = {
        id: "question-test-uuid",
        roomId: roomFixture.id,
        statement: "Qual é a capital do Brasil?",
        type: QuestionType.MULTIPLE_CHOICE,
        isActive: true,
        createdAt: baseDate,
        options: [
            {
                id: "opt-1",
                questionId: "question-test-uuid",
                text: "Brasília",
                isCorrect: true,
                position: 0,
            },
            {
                id: "opt-2",
                questionId: "question-test-uuid",
                text: "Rio de Janeiro",
                isCorrect: false,
                position: 1,
            },
        ],
    };

    let questionRepositoryMock: {
        findManyByRoomId: ReturnType<typeof vi.fn>;
        createInRoom: ReturnType<typeof vi.fn>;
        updateInRoom: ReturnType<typeof vi.fn>;
        deleteInRoom: ReturnType<typeof vi.fn>;
        importManyToRoom: ReturnType<typeof vi.fn>;
    };

    let roomRepositoryMock: {
        findById: ReturnType<typeof vi.fn>;
    };

    let service: QuestionService;

    beforeEach(() => {
        questionRepositoryMock = {
            findManyByRoomId: vi.fn(),
            createInRoom: vi.fn(),
            updateInRoom: vi.fn(),
            deleteInRoom: vi.fn(),
            importManyToRoom: vi.fn(),
        };

        roomRepositoryMock = {
            findById: vi.fn(),
        };

        service = new QuestionService(
            questionRepositoryMock as never,
            roomRepositoryMock as never,
        );
    });

    describe("listQuestions", () => {
        it("deve listar as perguntas da sala do próprio host", async () => {
            roomRepositoryMock.findById.mockResolvedValue(roomFixture);
            questionRepositoryMock.findManyByRoomId.mockResolvedValue([
                questionFixture,
            ]);

            const result = await service.listQuestions(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual([questionFixture]);
        });

        it("deve rejeitar consulta quando a sala não existir", async () => {
            roomRepositoryMock.findById.mockResolvedValue(null);

            await expect(
                service.listQuestions(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(QuestionRoomNotFoundError);
        });

        it("deve rejeitar consulta quando o usuário não for o host", async () => {
            roomRepositoryMock.findById.mockResolvedValue(roomFixture);

            await expect(
                service.listQuestions(roomFixture.id, "outro-host"),
            ).rejects.toThrow(QuestionRoomAccessDeniedError);
        });

        it("deve rejeitar consulta quando o identificador da sala estiver vazio", async () => {
            await expect(
                service.listQuestions("   ", roomFixture.hostId),
            ).rejects.toThrow(InvalidQuestionDataError);
        });
    });

    describe("createQuestion", () => {
        it("deve criar uma pergunta sob lock transacional da sala quando editável", async () => {
            questionRepositoryMock.createInRoom.mockResolvedValue({
                success: true,
                question: questionFixture,
            });

            const result = await service.createQuestion({
                roomId: roomFixture.id,
                hostId: roomFixture.hostId,
                statement: "Qual é a capital do Brasil?",
                options: validOptions,
            });

            expect(questionRepositoryMock.createInRoom).toHaveBeenCalledWith(
                roomFixture.id,
                roomFixture.hostId,
                {
                    statement: "Qual é a capital do Brasil?",
                    type: QuestionType.MULTIPLE_CHOICE,
                    options: validOptions,
                },
            );
            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar criação quando houver partida IN_PROGRESS ou sala ARCHIVED", async () => {
            questionRepositoryMock.createInRoom.mockResolvedValueOnce({
                success: false,
                reason: "ROOM_NOT_EDITABLE",
            });

            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "Pergunta bloqueada?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomNotEditableError);
        });

        it("deve rejeitar criação quando os dados forem inválidos sem chamar o repositório", async () => {
            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "   ",
                    options: validOptions,
                }),
            ).rejects.toThrow(InvalidQuestionDataError);

            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "Uma opção?",
                    options: [{ text: "Única", isCorrect: true }],
                }),
            ).rejects.toThrow(InvalidQuestionDataError);

            expect(questionRepositoryMock.createInRoom).not.toHaveBeenCalled();
        });

        it("deve rejeitar criação quando a sala não existir ou o usuário não for o host", async () => {
            questionRepositoryMock.createInRoom.mockResolvedValueOnce({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });
            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "Pergunta?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomNotFoundError);

            questionRepositoryMock.createInRoom.mockResolvedValueOnce({
                success: false,
                reason: "ACCESS_DENIED",
            });
            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: "outro-host",
                    statement: "Pergunta?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomAccessDeniedError);
        });
    });

    describe("updateQuestion", () => {
        it("deve atualizar uma pergunta sob lock da sala após validar payload", async () => {
            questionRepositoryMock.updateInRoom.mockResolvedValue({
                success: true,
                question: questionFixture,
            });

            const result = await service.updateQuestion(
                questionFixture.id,
                roomFixture.hostId,
                {
                    roomId: "outro-room-id",
                    statement: "Pergunta atualizada?",
                    options: validOptions,
                },
            );

            expect(questionRepositoryMock.updateInRoom).toHaveBeenCalledWith(
                questionFixture.id,
                roomFixture.hostId,
                {
                    statement: "Pergunta atualizada?",
                    type: QuestionType.MULTIPLE_CHOICE,
                    options: validOptions,
                },
            );
            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar atualização quando a pergunta não existir", async () => {
            questionRepositoryMock.updateInRoom.mockResolvedValue({
                success: false,
                reason: "QUESTION_NOT_FOUND",
            });

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                    { statement: "Atualizada?", options: validOptions },
                ),
            ).rejects.toThrow(QuestionNotFoundError);
        });

        it("deve rejeitar atualização quando a partida estiver IN_PROGRESS ou a sala ARCHIVED", async () => {
            questionRepositoryMock.updateInRoom.mockResolvedValue({
                success: false,
                reason: "ROOM_NOT_EDITABLE",
            });

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                    { statement: "Atualizada?", options: validOptions },
                ),
            ).rejects.toThrow(QuestionRoomNotEditableError);
        });

        it("deve rejeitar atualização com payload inválido ou usuário não autorizado", async () => {
            questionRepositoryMock.updateInRoom.mockResolvedValueOnce({
                success: false,
                reason: "ACCESS_DENIED",
            });

            await expect(
                service.updateQuestion(questionFixture.id, "outro-host", {
                    statement: "Atualizada?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomAccessDeniedError);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                    [],
                ),
            ).rejects.toThrow(InvalidQuestionDataError);
        });
    });

    describe("deleteQuestion", () => {
        it("deve excluir uma pergunta sob lock da sala quando editável", async () => {
            questionRepositoryMock.deleteInRoom.mockResolvedValue({
                success: true,
                question: questionFixture,
            });

            const result = await service.deleteQuestion(
                questionFixture.id,
                roomFixture.hostId,
            );

            expect(questionRepositoryMock.deleteInRoom).toHaveBeenCalledWith(
                questionFixture.id,
                roomFixture.hostId,
            );
            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar exclusão durante partida IN_PROGRESS ou sala ARCHIVED", async () => {
            questionRepositoryMock.deleteInRoom.mockResolvedValue({
                success: false,
                reason: "ROOM_NOT_EDITABLE",
            });

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                ),
            ).rejects.toThrow(QuestionRoomNotEditableError);
        });
    });

    describe("importQuestions", () => {
        it("deve validar lote antes de persistir e delegar ao repositório em lote válido", async () => {
            questionRepositoryMock.importManyToRoom.mockResolvedValue({
                success: true,
                questions: [questionFixture],
            });

            const result = await service.importQuestions(
                roomFixture.id,
                roomFixture.hostId,
                {
                    questions: [
                        {
                            statement: "  Qual é a capital do Brasil? ",
                            type: QuestionType.MULTIPLE_CHOICE,
                            options: validOptions,
                        },
                    ],
                },
            );

            expect(questionRepositoryMock.importManyToRoom).toHaveBeenCalledWith(
                roomFixture.id,
                roomFixture.hostId,
                [
                    {
                        statement: "Qual é a capital do Brasil?",
                        type: QuestionType.MULTIPLE_CHOICE,
                        options: validOptions,
                    },
                ],
            );
            expect(result).toEqual([questionFixture]);
        });

        it("deve rejeitar lote inválido sem chamar o repositório", async () => {
            await expect(
                service.importQuestions(roomFixture.id, roomFixture.hostId, {
                    questions: [],
                }),
            ).rejects.toThrow(InvalidQuestionDataError);

            expect(
                questionRepositoryMock.importManyToRoom,
            ).not.toHaveBeenCalled();
        });

        it("deve mapear falhas do repositório para erros de domínio", async () => {
            const validBatch = {
                questions: [
                    {
                        statement: "Qual é a capital do Brasil?",
                        options: validOptions,
                    },
                ],
            };

            questionRepositoryMock.importManyToRoom.mockResolvedValueOnce({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });
            await expect(
                service.importQuestions(
                    roomFixture.id,
                    roomFixture.hostId,
                    validBatch,
                ),
            ).rejects.toThrow(QuestionRoomNotFoundError);

            questionRepositoryMock.importManyToRoom.mockResolvedValueOnce({
                success: false,
                reason: "ACCESS_DENIED",
            });
            await expect(
                service.importQuestions(
                    roomFixture.id,
                    "outro-host",
                    validBatch,
                ),
            ).rejects.toThrow(QuestionRoomAccessDeniedError);

            questionRepositoryMock.importManyToRoom.mockResolvedValueOnce({
                success: false,
                reason: "ROOM_NOT_EDITABLE",
            });
            await expect(
                service.importQuestions(
                    roomFixture.id,
                    roomFixture.hostId,
                    validBatch,
                ),
            ).rejects.toThrow(QuestionRoomNotEditableError);
        });
    });
});
