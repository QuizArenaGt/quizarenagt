import { GameMode } from "@prisma/client";

export type CreateRoomDto = {
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
};

export type CreateRoomValidationResult =
    | {
        success: true;
        data: CreateRoomDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

const VALID_GAME_MODES: readonly GameMode[] = [
    GameMode.CLASSIC,
    GameMode.HARDCORE,
];

const DEFAULT_GAME_MODE = GameMode.CLASSIC;

function isValidGameMode(value: unknown): value is GameMode {
    return VALID_GAME_MODES.includes(value as GameMode);
}

export function validateCreateRoom(
    body: unknown,
): CreateRoomValidationResult {
    const errors: Record<string, string> = {};

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
    ) {
        return {
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto.",
            },
        };
    }

    const payload = body as Record<string, unknown>;
    const { maxPlayers, questionTime, gameMode } = payload;

    if (
        typeof maxPlayers !== "number" ||
        !Number.isInteger(maxPlayers) ||
        maxPlayers < 2 ||
        maxPlayers > 50
    ) {
        errors.maxPlayers =
            "A quantidade de jogadores deve ser um número inteiro entre 2 e 50.";
    }

    if (
        typeof questionTime !== "number" ||
        !Number.isInteger(questionTime) ||
        questionTime < 5 ||
        questionTime > 180
    ) {
        errors.questionTime =
            "O tempo por pergunta deve ser um número inteiro entre 5 e 180 segundos.";
    }

    let resolvedGameMode: GameMode = DEFAULT_GAME_MODE;

    if (gameMode !== undefined) {
        if (!isValidGameMode(gameMode)) {
            errors.gameMode = "O modo de jogo informado é inválido.";
        } else {
            resolvedGameMode = gameMode;
        }
    }

    if (Object.keys(errors).length > 0) {
        return {
            success: false,
            errors,
        };
    }

    return {
        success: true,
        data: {
            maxPlayers: maxPlayers as number,
            questionTime: questionTime as number,
            gameMode: resolvedGameMode,
        },
    };
}