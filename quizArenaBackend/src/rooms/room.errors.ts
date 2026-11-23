
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

export class RoomReplayNotAllowedError extends Error {
    constructor(message = "Já existe uma partida ativa para esta sala.") {
        super(message);
        this.name = "RoomReplayNotAllowedError";
    }
}

export class RoomGameNotFoundError extends Error {
    constructor(message = "Partida não encontrada para esta sala.") {
        super(message);
        this.name = "RoomGameNotFoundError";
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


export class RoomAuthenticationError extends Error {
    constructor(message = "Token de acesso inválido ou ausente.") {
        super(message);
        this.name = "RoomAuthenticationError";
    }
}

export type RoomStartRequirement =
    | "NOT_ENOUGH_PLAYERS"
    | "NOT_ENOUGH_QUESTIONS"
    | "START_REQUIREMENTS_NOT_MET";

export type RoomStartRequirementsDetails = {
    currentPlayers: number;
    requiredPlayers: number;
    currentQuestions: number;
    requiredQuestions: number;
    missingPlayers: boolean;
    missingQuestions: boolean;
};

function formatStartRequirementsMessage(
    reason: RoomStartRequirement,
    details?: RoomStartRequirementsDetails,
): string {
    if (details) {
        if (details.missingPlayers && details.missingQuestions) {
            return `Não é possível iniciar a partida: são necessários pelo menos ${details.requiredPlayers} jogadores ativos (atual: ${details.currentPlayers}) e pelo menos ${details.requiredQuestions} perguntas ativas (atual: ${details.currentQuestions}).`;
        }

        if (details.missingPlayers) {
            return `São necessários pelo menos ${details.requiredPlayers} jogadores ativos para iniciar a partida (atual: ${details.currentPlayers}).`;
        }

        if (details.missingQuestions) {
            return `São necessárias pelo menos ${details.requiredQuestions} perguntas ativas para iniciar a partida (atual: ${details.currentQuestions}).`;
        }
    }

    const fallbackMessages: Record<RoomStartRequirement, string> = {
        NOT_ENOUGH_PLAYERS:
            "A partida precisa de pelo menos 2 jogadores.",
        NOT_ENOUGH_QUESTIONS:
            "A partida precisa de pelo menos 5 perguntas ativas.",
        START_REQUIREMENTS_NOT_MET:
            "A partida precisa de pelo menos 2 jogadores ativos e pelo menos 5 perguntas ativas.",
    };

    return fallbackMessages[reason];
}

export class RoomStartRequirementsError extends Error {
    constructor(
        public readonly reason: RoomStartRequirement,
        public readonly details?: RoomStartRequirementsDetails,
    ) {
        super(formatStartRequirementsMessage(reason, details));
        this.name = "RoomStartRequirementsError";
    }
}
