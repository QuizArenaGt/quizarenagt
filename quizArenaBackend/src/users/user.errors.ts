
export class EmailAlreadyExistsError extends Error {
    constructor() {
        super("E-mail já cadastrado.");
        this.name = "EmailAlreadyExistsError";
    }
}

export class InvalidCredentialsError extends Error {
    constructor() {
        super("E-mail ou senha incorretos.");
        this.name = "InvalidCredentialsError";
    }
}

export class InvalidCurrentPasswordError extends Error {
    constructor() {
        super("Senha atual incorreta.");
        this.name = "InvalidCurrentPasswordError";
    }
}

export class SamePasswordError extends Error {
    constructor() {
        super("A nova senha deve ser diferente da senha atual.");
        this.name = "SamePasswordError";
    }
}