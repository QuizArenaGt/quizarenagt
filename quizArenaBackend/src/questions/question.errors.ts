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
