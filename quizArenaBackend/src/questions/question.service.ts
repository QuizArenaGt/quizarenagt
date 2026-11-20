
import {
    QuestionType,
    type Question,
    type QuestionOption,
} from "@prisma/client";

import { QuestionRepository } from "./question.repository.js";
import {
    RoomRepository,
    selectCurrentGame,
} from "../rooms/room.repository.js";

import {
    validateCreateQuestion,
    type CreateQuestionDto,
} from "./create-question.dto.js";

import {
    InvalidQuestionDataError,
    QuestionRoomAccessDeniedError,
    QuestionRoomNotFoundError,
    QuestionRoomNotEditableError,
    QuestionNotFoundError,
} from "./question.errors.js";

export type QuestionWithOptions = Question & {
    options: QuestionOption[];
};

type QuestionRepositoryContract = Pick<
    QuestionRepository,
    | "create"
    | "findManyByRoomId"
    | "findById"
    | "update"
    | "delete"
>;

type RoomRepositoryContract = Pick<
    RoomRepository,
    "findById" | "findByIdWithCurrentGame"
>;

export type CreateQuestionInput = {
    roomId: string;
    hostId: string;
    statement: string;
    type?: QuestionType;
    options: CreateQuestionDto["options"];
};

export class QuestionService {
    constructor(
        private readonly questionRepository: QuestionRepositoryContract =
            new QuestionRepository(),
        private readonly roomRepository: RoomRepositoryContract =
            new RoomRepository(),
    ) {}

    async listQuestions(
        roomId: string,
        hostId: string,
    ): Promise<QuestionWithOptions[]> {
        if (!roomId.trim()) {
            throw new InvalidQuestionDataError(
                "Identificador da sala obrigatório.",
                { roomId: "O identificador da sala é obrigatório." },
            );
        }

        const room = await this.roomRepository.findById(roomId);

        if (!room) {
            throw new QuestionRoomNotFoundError();
        }

        if (room.hostId !== hostId) {
            throw new QuestionRoomAccessDeniedError(
                "Você não tem permissão para consultar as perguntas desta sala.",
            );
        }

        return this.questionRepository.findManyByRoomId(roomId);
    }

    async createQuestion(
        data: CreateQuestionInput,
    ): Promise<QuestionWithOptions> {
        const validation = validateCreateQuestion(data);

        if (!validation.success) {
            throw new InvalidQuestionDataError(
                "Dados da pergunta inválidos.",
                validation.errors,
            );
        }

        const room = await this.roomRepository.findByIdWithCurrentGame(
            validation.data.roomId,
        );

        if (!room) {
            throw new QuestionRoomNotFoundError();
        }

        if (room.hostId !== data.hostId) {
            throw new QuestionRoomAccessDeniedError();
        }

        const currentGame = selectCurrentGame(room.games);

        if (
            room.status !== "ACTIVE" ||
            currentGame?.status === "IN_PROGRESS"
        ) {
            throw new QuestionRoomNotEditableError();
        }

        return this.questionRepository.create({
            roomId: validation.data.roomId,
            statement: validation.data.statement,
            type: validation.data.type ?? QuestionType.MULTIPLE_CHOICE,
            options: validation.data.options,
        });
    }

    async updateQuestion(
        questionId: string,
        hostId: string,
        body: unknown,
    ): Promise<QuestionWithOptions> {
        const question = await this.findEditableQuestion(
            questionId,
            hostId,
        );

        const payload =
            typeof body === "object" &&
            body !== null &&
            !Array.isArray(body)
                ? {
                    ...(body as Record<string, unknown>),
                    roomId: question.roomId,
                }
                : body;

        const validation = validateCreateQuestion(payload);

        if (!validation.success) {
            throw new InvalidQuestionDataError(
                "Dados da pergunta inválidos.",
                validation.errors,
            );
        }

        return this.questionRepository.update(questionId, {
            statement: validation.data.statement,
            type: validation.data.type,
            options: validation.data.options,
        });
    }

    async deleteQuestion(
        questionId: string,
        hostId: string,
    ): Promise<Question> {
        await this.findEditableQuestion(questionId, hostId);

        return this.questionRepository.delete(questionId);
    }

    private async findEditableQuestion(
        questionId: string,
        hostId: string,
    ): Promise<QuestionWithOptions> {
        const question = await this.questionRepository.findById(questionId);

        if (!question) {
            throw new QuestionNotFoundError();
        }

        const room = await this.roomRepository.findByIdWithCurrentGame(
            question.roomId,
        );

        if (!room) {
            throw new QuestionRoomNotFoundError();
        }

        if (room.hostId !== hostId) {
            throw new QuestionRoomAccessDeniedError(
                "Você não tem permissão para gerenciar as perguntas desta sala.",
            );
        }

        const currentGame = selectCurrentGame(room.games);

        if (
            room.status !== "ACTIVE" ||
            currentGame?.status === "IN_PROGRESS"
        ) {
            throw new QuestionRoomNotEditableError();
        }

        return question;
    }
}
