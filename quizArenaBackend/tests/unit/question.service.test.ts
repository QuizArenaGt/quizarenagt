
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    QuestionType,
    type Question,
    type QuestionOption,
    type Room,
} from "@prisma/client";

import { QuestionService } from "../../src/questions/question.service.js";
import {
    InvalidQuestionDataError,
    QuestionRoomAccessDeniedError,
    QuestionRoomNotFoundError,
    QuestionRoomNotEditableError,
    QuestionNotFoundError,
} from "../../src/questions/question.errors.js";

import type { QuestionRepository } from "../../src/questions/question.repository.js";
import type { RoomRepository } from "../../src/rooms/room.repository.js";
import type { CreateQuestionInput } from "../../src/questions/question.service.js";

type QuestionRepositoryMock = Pick<
    QuestionRepository,
    | "create"
    | "findManyByRoomId"
    | "findById"
    | "update"
    | "delete"
>;

type RoomRepositoryMock = Pick<
    RoomRepository,
    "findById"
>;

const validData: CreateQuestionInput = {
    statement: "Qual é a capital do Brasil?",
    type: QuestionType.MULTIPLE_CHOICE,
    options: [
        { text: "Brasília", isCorrect: true },
        { text: "São Paulo", isCorrect: false },
        { text: "Rio de Janeiro", isCorrect: false },
        { text: "Salvador", isCorrect: false },
    ],
    roomId: "room-test-uuid",
    hostId: "host-test-uuid",
};

const roomFixture: Room = {
    id: validData.roomId,
    code: "ABC123",
    hostId: validData.hostId,
    maxPlayers: 10,
    questionTime: 30,
    gameMode: "CLASSIC",
    status: "WAITING",
    createdAt: new Date("2026-11-12T12:00:00.000Z"),
    updatedAt: new Date("2026-11-12T12:00:00.000Z"),
};

const questionFixture: Question & { options: QuestionOption[] } = {
    id: "question-test-uuid",
    roomId: validData.roomId,
    statement: validData.statement,
    type: QuestionType.MULTIPLE_CHOICE,
    isActive: true,
    createdAt: new Date("2026-11-12T12:00:00.000Z"),
    updatedAt: new Date("2026-11-12T12:00:00.000Z"),
    options: validData.options.map((opt, index) => ({
        id: `option-${index + 1}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
        position: index + 1,
        questionId: "question-test-uuid",
    })),
};

describe("QuestionService", () => {
    let questionRepository: {
        create: ReturnType<typeof vi.fn>;
        findManyByRoomId: ReturnType<typeof vi.fn>;
        findById: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
    };

    let roomRepository: {
        findById: ReturnType<typeof vi.fn>;
    };

    let service: QuestionService;

    beforeEach(() => {
        questionRepository = {
            create: vi.fn(),
            findManyByRoomId: vi.fn(),
            findById: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        };

        roomRepository = {
            findById: vi.fn(),
        };

        service = new QuestionService(
            questionRepository as QuestionRepositoryMock,
            roomRepository as RoomRepositoryMock,
        );

        roomRepository.findById.mockResolvedValue(roomFixture);

        questionRepository.create.mockResolvedValue(questionFixture);
        questionRepository.findManyByRoomId.mockResolvedValue([
            questionFixture,
        ]);

        questionRepository.findById.mockResolvedValue(questionFixture);
        questionRepository.update.mockResolvedValue(questionFixture);
        questionRepository.delete.mockResolvedValue(questionFixture);
    });

    describe("listQuestions", () => {
        it("deve listar as perguntas da sala do próprio host", async () => {
            const result = await service.listQuestions(
                validData.roomId,
                validData.hostId,
            );

            expect(roomRepository.findById).toHaveBeenCalledWith(
                validData.roomId,
            );

            expect(questionRepository.findManyByRoomId).toHaveBeenCalledWith(
                validData.roomId,
            );

            expect(result).toEqual([questionFixture]);
        });

        it("deve rejeitar consulta quando a sala não existir", async () => {
            roomRepository.findById.mockResolvedValue(null);

            await expect(
                service.listQuestions(validData.roomId, validData.hostId),
            ).rejects.toBeInstanceOf(QuestionRoomNotFoundError);

            expect(questionRepository.findManyByRoomId).not.toHaveBeenCalled();
        });

        it("deve rejeitar consulta quando o usuário não for o host", async () => {
            await expect(
                service.listQuestions(validData.roomId, "another-host-uuid"),
            ).rejects.toBeInstanceOf(QuestionRoomAccessDeniedError);

            expect(questionRepository.findManyByRoomId).not.toHaveBeenCalled();
        });

        it("deve rejeitar consulta quando o identificador da sala estiver vazio", async () => {
            await expect(
                service.listQuestions("   ", validData.hostId),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(roomRepository.findById).not.toHaveBeenCalled();
            expect(questionRepository.findManyByRoomId).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados do repositório de perguntas", async () => {
            const databaseError = new Error(
                "Falha ao consultar perguntas",
            );

            questionRepository.findManyByRoomId.mockRejectedValue(
                databaseError,
            );

            await expect(
                service.listQuestions(validData.roomId, validData.hostId),
            ).rejects.toBe(databaseError);
        });
    });

    describe("createQuestion", () => {
        it("deve criar uma pergunta quando o usuário for o host da sala", async () => {
            const result = await service.createQuestion(validData);

            expect(roomRepository.findById).toHaveBeenCalledWith(
                validData.roomId,
            );

            expect(questionRepository.create).toHaveBeenCalledTimes(1);

            expect(questionRepository.create).toHaveBeenCalledWith({
                roomId: validData.roomId,
                statement: validData.statement,
                type: QuestionType.MULTIPLE_CHOICE,
                options: validData.options,
            });

            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar criação quando a sala não estiver aguardando jogadores", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                status: "IN_PROGRESS",
            });

            await expect(
                service.createQuestion(validData),
            ).rejects.toBeInstanceOf(QuestionRoomNotEditableError);

            expect(questionRepository.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar criação quando a sala estiver finalizada", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                status: "FINISHED",
            });

            await expect(
                service.createQuestion(validData),
            ).rejects.toBeInstanceOf(QuestionRoomNotEditableError);

            expect(questionRepository.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar criação quando o enunciado for vazio", async () => {
            await expect(
                service.createQuestion({
                    ...validData,
                    statement: "   ",
                }),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(roomRepository.findById).not.toHaveBeenCalled();
            expect(questionRepository.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar criação quando houver menos de 2 alternativas", async () => {
            await expect(
                service.createQuestion({
                    ...validData,
                    options: validData.options.slice(0, 1),
                }),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(roomRepository.findById).not.toHaveBeenCalled();
            expect(questionRepository.create).not.toHaveBeenCalled();
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

            expect(roomRepository.findById).not.toHaveBeenCalled();
            expect(questionRepository.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar criação quando a sala não existir", async () => {
            roomRepository.findById.mockResolvedValue(null);

            await expect(
                service.createQuestion(validData),
            ).rejects.toBeInstanceOf(QuestionRoomNotFoundError);

            expect(questionRepository.create).not.toHaveBeenCalled();
        });

        it("deve rejeitar criação quando o usuário não for o host da sala", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                hostId: "another-host-uuid",
            });

            await expect(
                service.createQuestion(validData),
            ).rejects.toBeInstanceOf(QuestionRoomAccessDeniedError);

            expect(questionRepository.create).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados do repositório de perguntas", async () => {
            const databaseError = new Error(
                "Falha de conexão com o banco",
            );

            questionRepository.create.mockRejectedValue(databaseError);

            await expect(
                service.createQuestion(validData),
            ).rejects.toBe(databaseError);
        });

        it("deve propagar erros inesperados do repositório de salas", async () => {
            const databaseError = new Error(
                "Falha ao consultar a sala",
            );

            roomRepository.findById.mockRejectedValue(databaseError);

            await expect(
                service.createQuestion(validData),
            ).rejects.toBe(databaseError);

            expect(questionRepository.create).not.toHaveBeenCalled();
        });
    });


    describe("updateQuestion", () => {
        const updateData = {
            statement: "Qual é a capital da França?",
            type: QuestionType.MULTIPLE_CHOICE,
            options: [
                { text: "Paris", isCorrect: true },
                { text: "Lyon", isCorrect: false },
                { text: "Marselha", isCorrect: false },
            ],
        };

        it("deve atualizar uma pergunta do próprio host", async () => {
            const result = await service.updateQuestion(
                questionFixture.id,
                validData.hostId,
                updateData,
            );

            expect(questionRepository.findById).toHaveBeenCalledWith(
                questionFixture.id,
            );

            expect(roomRepository.findById).toHaveBeenCalledWith(
                validData.roomId,
            );

            expect(questionRepository.update).toHaveBeenCalledWith(
                questionFixture.id,
                {
                    statement: updateData.statement,
                    type: updateData.type,
                    options: updateData.options,
                },
            );

            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar atualização quando a pergunta não existir", async () => {
            questionRepository.findById.mockResolvedValue(null);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBeInstanceOf(QuestionNotFoundError);

            expect(roomRepository.findById).not.toHaveBeenCalled();
            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando a sala não existir", async () => {
            roomRepository.findById.mockResolvedValue(null);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomNotFoundError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando o usuário não for o host", async () => {
            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    "another-host-uuid",
                    updateData,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomAccessDeniedError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando a sala estiver em andamento", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                status: "IN_PROGRESS",
            });

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomNotEditableError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando a sala estiver finalizada", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                status: "FINISHED",
            });

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomNotEditableError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando o enunciado estiver vazio", async () => {
            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    {
                        ...updateData,
                        statement: "   ",
                    },
                ),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando houver menos de 2 alternativas", async () => {
            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    {
                        ...updateData,
                        options: updateData.options.slice(0, 1),
                    },
                ),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando não houver exatamente uma alternativa correta", async () => {
            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    {
                        ...updateData,
                        options: updateData.options.map((option) => ({
                            ...option,
                            isCorrect: false,
                        })),
                    },
                ),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve preservar a sala original mesmo quando outro roomId for enviado", async () => {
            await service.updateQuestion(
                questionFixture.id,
                validData.hostId,
                {
                    ...updateData,
                    roomId: "another-room-uuid",
                },
            );

            expect(questionRepository.update).toHaveBeenCalledWith(
                questionFixture.id,
                {
                    statement: updateData.statement,
                    type: updateData.type,
                    options: updateData.options,
                },
            );
        });

        it("deve rejeitar atualização quando o body não for um objeto válido", async () => {
            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    null,
                ),
            ).rejects.toBeInstanceOf(InvalidQuestionDataError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados do repositório de perguntas", async () => {
            const databaseError = new Error(
                "Falha ao atualizar pergunta",
            );

            questionRepository.update.mockRejectedValue(databaseError);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBe(databaseError);
        });

        it("deve propagar erros inesperados ao consultar a pergunta", async () => {
            const databaseError = new Error(
                "Falha ao consultar pergunta",
            );

            questionRepository.findById.mockRejectedValue(databaseError);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBe(databaseError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados ao consultar a sala", async () => {
            const databaseError = new Error(
                "Falha ao consultar sala",
            );

            roomRepository.findById.mockRejectedValue(databaseError);

            await expect(
                service.updateQuestion(
                    questionFixture.id,
                    validData.hostId,
                    updateData,
                ),
            ).rejects.toBe(databaseError);

            expect(questionRepository.update).not.toHaveBeenCalled();
        });
    });


    describe("deleteQuestion", () => {
        it("deve excluir uma pergunta do próprio host", async () => {
            const result = await service.deleteQuestion(
                questionFixture.id,
                validData.hostId,
            );

            expect(questionRepository.findById).toHaveBeenCalledWith(
                questionFixture.id,
            );

            expect(roomRepository.findById).toHaveBeenCalledWith(
                validData.roomId,
            );

            expect(questionRepository.delete).toHaveBeenCalledWith(
                questionFixture.id,
            );

            expect(result).toEqual(questionFixture);
        });

        it("deve rejeitar exclusão quando a pergunta não existir", async () => {
            questionRepository.findById.mockResolvedValue(null);

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBeInstanceOf(QuestionNotFoundError);

            expect(roomRepository.findById).not.toHaveBeenCalled();
            expect(questionRepository.delete).not.toHaveBeenCalled();
        });

        it("deve rejeitar exclusão quando a sala não existir", async () => {
            roomRepository.findById.mockResolvedValue(null);

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomNotFoundError);

            expect(questionRepository.delete).not.toHaveBeenCalled();
        });

        it("deve rejeitar exclusão quando o usuário não for o host", async () => {
            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    "another-host-uuid",
                ),
            ).rejects.toBeInstanceOf(QuestionRoomAccessDeniedError);

            expect(questionRepository.delete).not.toHaveBeenCalled();
        });

        it("deve rejeitar exclusão quando a sala estiver em andamento", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                status: "IN_PROGRESS",
            });

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomNotEditableError);

            expect(questionRepository.delete).not.toHaveBeenCalled();
        });

        it("deve rejeitar exclusão quando a sala estiver finalizada", async () => {
            roomRepository.findById.mockResolvedValue({
                ...roomFixture,
                status: "FINISHED",
            });

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBeInstanceOf(QuestionRoomNotEditableError);

            expect(questionRepository.delete).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados do repositório ao excluir", async () => {
            const databaseError = new Error(
                "Falha ao excluir pergunta",
            );

            questionRepository.delete.mockRejectedValue(databaseError);

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBe(databaseError);
        });

        it("deve propagar erros inesperados ao consultar a pergunta", async () => {
            const databaseError = new Error(
                "Falha ao consultar pergunta",
            );

            questionRepository.findById.mockRejectedValue(databaseError);

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBe(databaseError);

            expect(questionRepository.delete).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados ao consultar a sala", async () => {
            const databaseError = new Error(
                "Falha ao consultar sala",
            );

            roomRepository.findById.mockRejectedValue(databaseError);

            await expect(
                service.deleteQuestion(
                    questionFixture.id,
                    validData.hostId,
                ),
            ).rejects.toBe(databaseError);

            expect(questionRepository.delete).not.toHaveBeenCalled();
        });
    });

});
