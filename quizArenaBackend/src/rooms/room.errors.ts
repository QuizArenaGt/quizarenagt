
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

export class RoomNotFoundError extends Error {
    constructor(message = "Sala não encontrada.") {
        super(message);
        this.name = "RoomNotFoundError";
    }
}

export class RoomAccessDeniedError extends Error {
    constructor(message = "Você não tem permissão para alterar esta sala.") {
        super(message);
        this.name = "RoomAccessDeniedError";
    }
}

export class RoomNotEditableError extends Error {
    constructor(message = "As configurações desta sala não podem mais ser alteradas.") {
        super(message);
        this.name = "RoomNotEditableError";
    }
}

export class RoomNotJoinableError extends Error {
    constructor(message = "Esta sala não está aceitando novos jogadores.") {
        super(message);
        this.name = "RoomNotJoinableError";
    }
}

export class RoomFullError extends Error {
    constructor(message = "Esta sala atingiu o limite de jogadores.") {
        super(message);
        this.name = "RoomFullError";
    }
}

export class DuplicateNicknameError extends Error {
    constructor(message = "Este nickname já está sendo utilizado nesta sala.") {
        super(message);
        this.name = "DuplicateNicknameError";
    }
}