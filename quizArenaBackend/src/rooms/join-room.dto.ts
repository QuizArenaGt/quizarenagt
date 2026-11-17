
export type JoinRoomDto = {
    code: string;
    nickname: string;
};

export type JoinRoomValidationResult =
    | {
        success: true;
        data: JoinRoomDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

export function validateJoinRoom(
    body: unknown,
): JoinRoomValidationResult {
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
    const { code, nickname } = payload;

    let normalizedCode = "";
    let normalizedNickname = "";

    if (typeof code !== "string" || code.trim().length === 0) {
        errors.code = "O código da sala é obrigatório.";
    } else {
        normalizedCode = code.trim().toUpperCase();

        if (normalizedCode.length !== 6) {
            errors.code = "O código da sala deve possuir 6 caracteres.";
        }
    }

    if (typeof nickname !== "string" || nickname.trim().length === 0) {
        errors.nickname = "O nickname é obrigatório.";
    } else {
        normalizedNickname = nickname.trim();

        if (normalizedNickname.length < 2 || normalizedNickname.length > 20) {
            errors.nickname =
                "O nickname deve possuir entre 2 e 20 caracteres.";
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
            code: normalizedCode,
            nickname: normalizedNickname,
        },
    };
}
