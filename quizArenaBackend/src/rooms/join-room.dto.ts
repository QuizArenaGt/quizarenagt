
import {
    DEFAULT_PLAYER_AVATAR_ID,
    isValidPlayerAvatarId,
    type PlayerAvatarId,
} from "./player-avatar.js";

export type JoinRoomDto = {
    code: string;
    nickname: string;
    avatarId: PlayerAvatarId;
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

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

export function normalizeRoomCode(code: string): string {
    return code.replace(/\s+/g, "").toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
    return ROOM_CODE_REGEX.test(code);
}

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
    const { code, nickname, avatarId } = payload;

    let normalizedCode = "";
    let normalizedNickname = "";
    let resolvedAvatarId: PlayerAvatarId = DEFAULT_PLAYER_AVATAR_ID;

    if (typeof code !== "string" || normalizeRoomCode(code).length === 0) {
        errors.code = "O código da sala é obrigatório.";
    } else {
        normalizedCode = normalizeRoomCode(code);

        if (normalizedCode.length !== ROOM_CODE_LENGTH) {
            errors.code = "O código da sala deve possuir 6 caracteres.";
        } else if (!isValidRoomCode(normalizedCode)) {
            errors.code =
                "O código da sala deve conter apenas letras e números.";
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

    if (avatarId !== undefined && avatarId !== null) {
        if (!isValidPlayerAvatarId(avatarId)) {
            errors.avatarId = "O avatar selecionado é inválido.";
        } else {
            resolvedAvatarId = avatarId.trim() as PlayerAvatarId;
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
            avatarId: resolvedAvatarId,
        },
    };
}
