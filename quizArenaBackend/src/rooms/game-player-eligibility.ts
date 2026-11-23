import type { GamePlayerStatus } from "@prisma/client";

export type PlayerEligibilitySubject = {
    status?: GamePlayerStatus | null;
};

/**
 * Define se o participante ainda participa ativamente da partida
 * (elegível para contagem de lobby, início, envio de respostas e auto-fechamento).
 */
export function isGamePlayerActive(
    player: PlayerEligibilitySubject | null | undefined,
): boolean {
    return player?.status === "ACTIVE";
}

/**
 * Filtra exclusivamente participantes com status ACTIVE.
 */
export function filterActiveGamePlayers<T extends PlayerEligibilitySubject>(
    players: readonly T[],
): T[] {
    return players.filter((player) => isGamePlayerActive(player));
}

/**
 * Conta apenas participantes elegíveis (ACTIVE).
 */
export function countActiveGamePlayers(
    players: readonly PlayerEligibilitySubject[],
): number {
    return filterActiveGamePlayers(players).length;
}
