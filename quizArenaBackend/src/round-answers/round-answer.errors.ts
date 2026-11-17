
export class RoundAnswerRoundNotFoundError extends Error {
    constructor(message = "Rodada não encontrada.") {
        super(message);
        this.name = "RoundAnswerRoundNotFoundError";
    }
}

export class RoundAnswerPlayerNotInRoomError extends Error {
    constructor(
        message = "Participante não pertence à sala desta rodada.",
    ) {
        super(message);
        this.name = "RoundAnswerPlayerNotInRoomError";
    }
}

export class RoundAnswerRoundNotOpenError extends Error {
    constructor(message = "Esta rodada não está mais aberta.") {
        super(message);
        this.name = "RoundAnswerRoundNotOpenError";
    }
}

export class RoundAnswerGameNotInProgressError extends Error {
    constructor(message = "A partida não está em andamento.") {
        super(message);
        this.name = "RoundAnswerGameNotInProgressError";
    }
}

export class RoundAnswerOptionNotValidError extends Error {
    constructor(
        message = "A alternativa não pertence à pergunta desta rodada.",
    ) {
        super(message);
        this.name = "RoundAnswerOptionNotValidError";
    }
}

export class RoundAnswerAlreadySubmittedError extends Error {
    constructor(
        message = "Você já respondeu a esta rodada.",
    ) {
        super(message);
        this.name = "RoundAnswerAlreadySubmittedError";
    }
}
