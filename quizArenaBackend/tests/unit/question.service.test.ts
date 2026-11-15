
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
} from "../../src/questions/question.errors.js";
import type { QuestionRepository } from "../../src/questions/question.repository.js";
import type { RoomRepository } from "../../src/rooms/room.repository.js";
import type { CreateQuestionInput } from "../../src/questions/question.service.js";

type QuestionRepositoryMock = Pick<QuestionRepository, "create">;
type RoomRepositoryMock = Pick<RoomRepository, "findById">;

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
        questionId: "question-test-uuid",
    })),
};

describe("QuestionService", () => {
    let questionRepository: {
        create: ReturnType<typeof vi.fn>;
    };
    let roomRepository: {
        findById: ReturnType<typeof vi.fn>;
    };
    let service: QuestionService;

    beforeEach(() => {
        questionRepository = {
            create: vi.fn(),
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
    });

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

    it("deve rejeitar criação quando não houver exatamente 4 alternativas", async () => {
        await expect(
            service.createQuestion({
                ...validData,
                options: validData.options.slice(0, 2),
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
        const databaseError = new Error("Falha de conexão com o banco");
        questionRepository.create.mockRejectedValue(databaseError);

        await expect(
            service.createQuestion(validData),
        ).rejects.toBe(databaseError);
    });

    it("deve propagar erros inesperados do repositório de salas", async () => {
        const databaseError = new Error("Falha ao consultar a sala");
        roomRepository.findById.mockRejectedValue(databaseError);

        await expect(
            service.createQuestion(validData),
        ).rejects.toBe(databaseError);

        expect(questionRepository.create).not.toHaveBeenCalled();
    });
});
