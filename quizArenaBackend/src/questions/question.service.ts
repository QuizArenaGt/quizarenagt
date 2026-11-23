
import {
    QuestionType,
    type Question,
    type QuestionOption,
} from "@prisma/client";

import {
    QuestionRepository,
    type QuestionRoomMutationFailureReason,
} from "./question.repository.js";
import { RoomRepository } from "../rooms/room.repository.js";

import {
    validateCreateQuestion,
    validateQuestionItem,
    type CreateQuestionDto,
} from "./create-question.dto.js";
import { validateImportQuestions } from "./import-questions.dto.js";

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
    | "findManyByRoomId"
    | "createInRoom"
    | "updateInRoom"
    | "deleteInRoom"
    | "importManyToRoom"
>;

type RoomRepositoryContract = Pick<RoomRepository, "findById">;

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

        const result = await this.questionRepository.createInRoom(
            validation.data.roomId,
            data.hostId,
            {
                statement: validation.data.statement,
                type: validation.data.type ?? QuestionType.MULTIPLE_CHOICE,
                options: validation.data.options,
            },
        );

        if (result.success) {
            return result.question;
        }

        this.throwRoomMutationError(result.reason);
    }

    async updateQuestion(
        questionId: string,
        hostId: string,
        body: unknown,
    ): Promise<QuestionWithOptions> {
        const validation = validateQuestionItem(body);

        if (!validation.success) {
            throw new InvalidQuestionDataError(
                "Dados da pergunta inválidos.",
                validation.errors,
            );
        }

        const result = await this.questionRepository.updateInRoom(
            questionId,
            hostId,
            {
                statement: validation.data.statement,
                type: validation.data.type,
                options: validation.data.options,
            },
        );

        if (result.success) {
            return result.question;
        }

        this.throwRoomMutationError(
            result.reason,
            "Você não tem permissão para gerenciar as perguntas desta sala.",
        );
    }

    async deleteQuestion(
        questionId: string,
        hostId: string,
    ): Promise<Question> {
        const result = await this.questionRepository.deleteInRoom(
            questionId,
            hostId,
        );

        if (result.success) {
            return result.question;
        }

        this.throwRoomMutationError(
            result.reason,
            "Você não tem permissão para gerenciar as perguntas desta sala.",
        );
    }

    async importQuestions(
        roomId: string,
        hostId: string,
        body: unknown,
    ): Promise<QuestionWithOptions[]> {
        const normalizedRoomId = roomId.trim();

        if (!normalizedRoomId) {
            throw new InvalidQuestionDataError(
                "Identificador da sala obrigatório.",
                { roomId: "O identificador da sala é obrigatório." },
            );
        }

        const validation = validateImportQuestions(body);

        if (!validation.success) {
            throw new InvalidQuestionDataError(
                "Dados da importação inválidos.",
                validation.errors,
            );
        }

        const result = await this.questionRepository.importManyToRoom(
            normalizedRoomId,
            hostId,
            validation.data.questions,
        );

        if (result.success) {
            return result.questions;
        }

        this.throwRoomMutationError(result.reason);
    }

    private throwRoomMutationError(
        reason: QuestionRoomMutationFailureReason,
        accessDeniedMessage?: string,
    ): never {
        switch (reason) {
            case "QUESTION_NOT_FOUND":
                throw new QuestionNotFoundError();

            case "ROOM_NOT_FOUND":
                throw new QuestionRoomNotFoundError();

            case "ACCESS_DENIED":
                throw new QuestionRoomAccessDeniedError(accessDeniedMessage);

            case "ROOM_NOT_EDITABLE":
                throw new QuestionRoomNotEditableError();
        }
    }
}
