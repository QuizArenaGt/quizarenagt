export const PLAYER_AVATAR_IDS = [
    "explorer",
    "fox",
    "robot",
    "cat",
    "frog",
    "alien",
    "dino",
    "dj",
    "astronaut",
    "panda",
    "inventor",
    "pirate",
    "bee",
    "wizard",
    "red-panda",
    "monster",
    "rockstar",
] as const;

export type PlayerAvatarId = (typeof PLAYER_AVATAR_IDS)[number];

export const DEFAULT_PLAYER_AVATAR_ID: PlayerAvatarId = "explorer";

const ALLOWED_AVATAR_SET: ReadonlySet<string> = new Set(PLAYER_AVATAR_IDS);

export function isValidPlayerAvatarId(value: unknown): value is PlayerAvatarId {
    return typeof value === "string" && ALLOWED_AVATAR_SET.has(value.trim());
}

/**
 * Resolve qualquer valor recebido ou legado para um identificador válido do catálogo oficial.
 */
export function resolvePlayerAvatarId(value: unknown): PlayerAvatarId {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (ALLOWED_AVATAR_SET.has(trimmed)) {
            return trimmed as PlayerAvatarId;
        }
    }
    return DEFAULT_PLAYER_AVATAR_ID;
}
