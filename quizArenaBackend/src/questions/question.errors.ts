
export class InvalidQuestionDataError extends Error {
    public readonly errors: Record<string, string>;

    constructor(
        message = "Dados da pergunta inválidos.",
        errors: Record<string, string> = {},
    ) {
        super(message);
        this.name = "InvalidQuestionDataError";
        this.errors = errors;
    }
}

export class QuestionRoomNotFoundError extends Error {
    constructor(message = "Sala não encontrada.") {
        super(message);
        this.name = "QuestionRoomNotFoundError";
    }
}

export class QuestionRoomAccessDeniedError extends Error {
    constructor(message = "Você não tem permissão para adicionar perguntas nesta sala.") {
        super(message);
        this.name = "QuestionRoomAccessDeniedError";
    }
}
