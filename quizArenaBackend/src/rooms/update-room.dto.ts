
import { GameMode } from "@prisma/client";

export type UpdateRoomDto = {
    maxPlayers?: number;
    questionTime?: number;
    gameMode?: GameMode;
};

export type UpdateRoomValidationResult =
    | {
        success: true;
        data: UpdateRoomDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

const VALID_GAME_MODES: readonly GameMode[] = [
    GameMode.CLASSIC,
    GameMode.HARDCORE,
];

function isValidGameMode(value: unknown): value is GameMode {
    return VALID_GAME_MODES.includes(value as GameMode);
}

export function validateUpdateRoom(
    body: unknown,
): UpdateRoomValidationResult {
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
    const errors: Record<string, string> = {};
    const data: UpdateRoomDto = {};

    const allowedFields = [
        "maxPlayers",
        "questionTime",
        "gameMode",
    ];

    const providedFields = allowedFields.filter(
        (field) => Object.hasOwn(payload, field),
    );

    if (providedFields.length === 0) {
        errors.body = "Informe ao menos uma configuração para atualizar.";
    }

    if (Object.hasOwn(payload, "maxPlayers")) {
        const value = payload.maxPlayers;

        if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < 2 ||
            value > 50
        ) {
            errors.maxPlayers =
                "A quantidade de jogadores deve ser um número inteiro entre 2 e 50.";
        } else {
            data.maxPlayers = value;
        }
    }

    if (Object.hasOwn(payload, "questionTime")) {
        const value = payload.questionTime;

        if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < 5 ||
            value > 180
        ) {
            errors.questionTime =
                "O tempo por pergunta deve ser um número inteiro entre 5 e 180 segundos.";
        } else {
            data.questionTime = value;
        }
    }

    if (Object.hasOwn(payload, "gameMode")) {
        const value = payload.gameMode;

        if (!isValidGameMode(value)) {
            errors.gameMode = "O modo de jogo informado é inválido.";
        } else {
            data.gameMode = value;
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
        data,
    };
}
