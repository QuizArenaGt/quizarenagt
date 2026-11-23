import { resolvePlayerAvatarId } from '../models/avatars.ts';
import { isValidRoomCode, normalizeRoomCode } from '../models/game.ts';

export const PLAYER_SESSION_STORAGE_KEY = 'quizarena:player-session';

export interface PersistedPlayerSession {
    sessionToken: string;
    roomCode: string;
    roomId: string;
    gameId: string;
    playerId: string;
    nickname: string;
    avatarId?: string;
}

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveSessionStorage(customStorage?: StorageAdapter): StorageAdapter | null {
    if (customStorage) {
        return customStorage;
    }

    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizePersistedSession(raw: unknown): PersistedPlayerSession | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }

    const candidate = raw as Record<string, unknown>;
    if (
        !isNonEmptyString(candidate.sessionToken) ||
        !isNonEmptyString(candidate.roomCode) ||
        !isNonEmptyString(candidate.roomId) ||
        !isNonEmptyString(candidate.gameId) ||
        !isNonEmptyString(candidate.playerId) ||
        !isNonEmptyString(candidate.nickname)
    ) {
        return null;
    }

    const normalizedCode = normalizeRoomCode(candidate.roomCode);
    if (!isValidRoomCode(normalizedCode)) {
        return null;
    }

    return {
        sessionToken: candidate.sessionToken.trim(),
        roomCode: normalizedCode,
        roomId: candidate.roomId.trim(),
        gameId: candidate.gameId.trim(),
        playerId: candidate.playerId.trim(),
        nickname: candidate.nickname.trim(),
        ...(isNonEmptyString(candidate.avatarId)
            ? { avatarId: resolvePlayerAvatarId(candidate.avatarId) }
            : {}),
    };
}

/**
 * Persiste os identificadores mínimos da sessão ativa do jogador no sessionStorage.
 */
export function savePlayerSession(
    session: PersistedPlayerSession,
    customStorage?: StorageAdapter,
): boolean {
    const storage = resolveSessionStorage(customStorage);
    const normalized = normalizePersistedSession(session);
    if (!storage || !normalized) {
        return false;
    }

    try {
        storage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(normalized));
        return true;
    } catch {
        return false;
    }
}

/**
 * Lê e valida a sessão persistida no sessionStorage.
 * Remove automaticamente entradas corrompidas ou incompletas.
 */
export function loadPlayerSession(
    customStorage?: StorageAdapter,
): PersistedPlayerSession | null {
    const storage = resolveSessionStorage(customStorage);
    if (!storage) {
        return null;
    }

    try {
        const raw = storage.getItem(PLAYER_SESSION_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed: unknown = JSON.parse(raw);
        const normalized = normalizePersistedSession(parsed);
        if (!normalized) {
            storage.removeItem(PLAYER_SESSION_STORAGE_KEY);
            return null;
        }

        return normalized;
    } catch {
        try {
            storage.removeItem(PLAYER_SESSION_STORAGE_KEY);
        } catch {
            // Ignora falha ao limpar chave inválida
        }
        return null;
    }
}

/**
 * Remove a sessão persistida do jogador no sessionStorage.
 */
export function clearPlayerSession(customStorage?: StorageAdapter): void {
    const storage = resolveSessionStorage(customStorage);
    if (!storage) {
        return;
    }

    try {
        storage.removeItem(PLAYER_SESSION_STORAGE_KEY);
    } catch {
        // Ignora indisponibilidade de storage
    }
}
