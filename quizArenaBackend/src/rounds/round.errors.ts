export class RoundRoomNotFoundError extends Error {
    constructor(message = "Sala não encontrada.") {
        super(message);
        this.name = "RoundRoomNotFoundError";
    }
}

export class RoundAccessDeniedError extends Error {
    constructor(
        message = "Somente o host pode controlar as rodadas desta partida.",
    ) {
        super(message);
        this.name = "RoundAccessDeniedError";
    }
}

export class RoundRoomNotInProgressError extends Error {
    constructor(
        message = "A sala não possui uma partida em andamento.",
    ) {
        super(message);
        this.name = "RoundRoomNotInProgressError";
    }
}

export class RoundGameNotFoundError extends Error {
    constructor(
        message = "Partida não encontrada para esta sala.",
    ) {
        super(message);
        this.name = "RoundGameNotFoundError";
    }
}

export class RoundAlreadyOpenError extends Error {
    constructor(
        message = "A rodada atual ainda está aberta.",
    ) {
        super(message);
        this.name = "RoundAlreadyOpenError";
    }
}

export class PreviousRoundNotClosedError extends Error {
    constructor(
        message = "A rodada anterior precisa ser encerrada antes de avançar.",
    ) {
        super(message);
        this.name = "PreviousRoundNotClosedError";
    }
}

export class RoundDeckFinishedError extends Error {
    constructor(
        message = "Todas as perguntas da partida já foram utilizadas.",
    ) {
        super(message);
        this.name = "RoundDeckFinishedError";
    }
}

export class RoundNotFoundError extends Error {
    constructor(message = "Rodada não encontrada.") {
        super(message);
        this.name = "RoundNotFoundError";
    }
}

export class RoundNotReadyError extends Error {
    constructor(
        message = "A rodada ainda está em andamento.",
    ) {
        super(message);
        this.name = "RoundNotReadyError";
    }
}
