
export class InvalidRoomDataError extends Error {
    public readonly errors: Record<string, string>;

    constructor(
        message = "Dados da sala inválidos.",
        errors: Record<string, string> = {},
    ) {
        super(message);
        this.name = "InvalidRoomDataError";
        this.errors = errors;
    }
}
