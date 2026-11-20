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
        create: ReturnType<typeof vi.fn>;
        findManyByRoomId: ReturnType<typeof vi.fn>;
        findById: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
    };

    let roomRepositoryMock: {
        findById: ReturnType<typeof vi.fn>;
        findByIdWithCurrentGame: ReturnType<typeof vi.fn>;
    };

    let service: QuestionService;

    beforeEach(() => {
        questionRepositoryMock = {
            create: vi.fn(),
            findManyByRoomId: vi.fn(),
            findById: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        };

        roomRepositoryMock = {
            findById: vi.fn(),
            findByIdWithCurrentGame: vi.fn(),
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
        it("deve criar uma pergunta quando a sala estiver ACTIVE e o Game não estiver IN_PROGRESS", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(
                roomFixture,
            );
            questionRepositoryMock.create.mockResolvedValue(questionFixture);

            const result = await service.createQuestion({
                roomId: roomFixture.id,
                hostId: roomFixture.hostId,
                statement: "Qual é a capital do Brasil?",
                options: validOptions,
            });

            expect(questionRepositoryMock.create).toHaveBeenCalledWith({
                roomId: roomFixture.id,
                statement: "Qual é a capital do Brasil?",
                type: QuestionType.MULTIPLE_CHOICE,
                options: validOptions,
            });
            expect(result).toEqual(questionFixture);
        });

        it("deve permitir criar pergunta entre partidas (Game FINISHED em sala ACTIVE)", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue({
                ...roomFixture,
                games: [{ ...baseGameFixture, status: "FINISHED" }],
            });
            questionRepositoryMock.create.mockResolvedValue(questionFixture);

            const result = await service.createQuestion({
                roomId: roomFixture.id,
                hostId: roomFixture.hostId,
                statement: "Nova pergunta para próxima partida?",
                options: validOptions,
            });

            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar criação quando houver partida IN_PROGRESS ou sala ARCHIVED", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce({
                ...roomFixture,
                games: [{ ...baseGameFixture, status: "IN_PROGRESS" }],
            });

            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "Pergunta bloqueada?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomNotEditableError);

            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce({
                ...roomFixture,
                status: "ARCHIVED",
            });

            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "Pergunta em sala arquivada?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomNotEditableError);
        });

        it("deve rejeitar criação quando os dados forem inválidos", async () => {
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
        });

        it("deve rejeitar criação quando a sala não existir ou o usuário não for o host", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce(
                null,
            );
            await expect(
                service.createQuestion({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    statement: "Pergunta?",
                    options: validOptions,
                }),
            ).rejects.toThrow(QuestionRoomNotFoundError);

            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce(
                roomFixture,
            );
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
        it("deve atualizar uma pergunta preservando o roomId original", async () => {
            questionRepositoryMock.findById.mockResolvedValue(questionFixture);
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(
                roomFixture,
            );
            questionRepositoryMock.update.mockResolvedValue(questionFixture);

            const result = await service.updateQuestion(
                questionFixture.id,
                roomFixture.hostId,
                {
                    roomId: "outro-room-id",
                    statement: "Pergunta atualizada?",
                    options: validOptions,
                },
            );

            expect(questionRepositoryMock.update).toHaveBeenCalledWith(
                questionFixture.id,
                {
                    statement: "Pergunta atualizada?",
                    type: QuestionType.MULTIPLE_CHOICE,
                    options: validOptions,
                },
            );
            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar atualização quando a pergunta não existir", async () => {
            questionRepositoryMock.findById.mockResolvedValue(null);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                    { statement: "Atualizada?", options: validOptions },
                ),
            ).rejects.toThrow(QuestionNotFoundError);
        });

        it("deve rejeitar atualização quando a partida estiver IN_PROGRESS ou a sala ARCHIVED", async () => {
            questionRepositoryMock.findById.mockResolvedValue(questionFixture);
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce({
                ...roomFixture,
                games: [{ ...baseGameFixture, status: "IN_PROGRESS" }],
            });

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                    { statement: "Atualizada?", options: validOptions },
                ),
            ).rejects.toThrow(QuestionRoomNotEditableError);

            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce({
                ...roomFixture,
                status: "ARCHIVED",
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
            questionRepositoryMock.findById.mockResolvedValue(questionFixture);
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(
                roomFixture,
            );

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
        it("deve excluir uma pergunta quando a sala estiver ACTIVE e não estiver IN_PROGRESS", async () => {
            questionRepositoryMock.findById.mockResolvedValue(questionFixture);
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(
                roomFixture,
            );
            questionRepositoryMock.delete.mockResolvedValue(questionFixture);

            const result = await service.deleteQuestion(
                questionFixture.id,
                roomFixture.hostId,
            );

            expect(questionRepositoryMock.delete).toHaveBeenCalledWith(
                questionFixture.id,
            );
            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar exclusão durante partida IN_PROGRESS ou sala ARCHIVED", async () => {
            questionRepositoryMock.findById.mockResolvedValue(questionFixture);
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce({
                ...roomFixture,
                games: [{ ...baseGameFixture, status: "IN_PROGRESS" }],
            });

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                ),
            ).rejects.toThrow(QuestionRoomNotEditableError);

            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValueOnce({
                ...roomFixture,
                status: "ARCHIVED",
            });

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    roomFixture.hostId,
                ),
            ).rejects.toThrow(QuestionRoomNotEditableError);
        });
    });
});
