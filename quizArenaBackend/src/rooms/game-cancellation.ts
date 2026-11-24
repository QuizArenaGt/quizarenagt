import type { Prisma } from "@prisma/client";
import {
    getServerNowDate,
    isServerClockCalibrated,
} from "../realtime/server-clock.js";
import {
    resolvePlayerAvatarId,
    type PlayerAvatarId,
} from "./player-avatar.js";

export const MIN_ELIGIBLE_PLAYERS_TO_CONTINUE = 2;

export type GameCancellationReason = "INSUFFICIENT_PLAYERS";

export type CancelledGameSummary = {
    gameId: string;
    status: "CANCELLED";
    reason: GameCancellationReason;
    finishedAt: Date;
    ranking: {
        id: string;
        nickname: string;
        avatarId: PlayerAvatarId;
        score: number;
        position: number;
    }[];
};

/**
 * Cancela atomicamente uma partida em andamento quando o número de jogadores
 * elegíveis (ACTIVE) cai abaixo do mínimo competitivo (< 2).
 *
 * Deve ser chamado dentro de uma transação que já detém o lock da sala
 * (`SELECT id FROM rooms WHERE id = ... FOR UPDATE`), mantendo a hierarquia
 * de locks `rooms -> rounds`.
 */
export async function cancelInProgressGameIfInsufficientPlayersTx(
    tx: Prisma.TransactionClient,
    gameId: string,
    eligiblePlayerCount: number,
): Promise<CancelledGameSummary | null> {
    if (eligiblePlayerCount >= MIN_ELIGIBLE_PLAYERS_TO_CONTINUE) {
        return null;
    }

    const game = await tx.game.findUnique({
        where: { id: gameId },
        select: {
            id: true,
            status: true,
        },
    });

    if (!game || game.status !== "IN_PROGRESS") {
        return null;
    }

    let now: Date;
    if (isServerClockCalibrated()) {
        now = getServerNowDate();
    } else {
        const [{ now: dbNow }] = await tx.$queryRaw<[{ now: Date }]>`
            SELECT NOW() AS now
        `;
        now = dbNow;
    }

    // Mantém a ordem global de locks rooms -> rounds antes de fechar rodadas abertas.
    await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM rounds
        WHERE "gameId" = ${gameId}
          AND status = 'OPEN'
        FOR UPDATE
    `;

    await tx.round.updateMany({
        where: {
            gameId,
            status: "OPEN",
        },
        data: {
            status: "CLOSED",
            closedAt: now,
        },
    });

    const updatedGame = await tx.game.updateMany({
        where: {
            id: gameId,
            status: "IN_PROGRESS",
        },
        data: {
            status: "CANCELLED",
            finishedAt: now,
        },
    });

    if (updatedGame.count === 0) {
        return null;
    }

    const activePlayers = await tx.gamePlayer.findMany({
        where: {
            gameId,
            status: "ACTIVE",
        },
        orderBy: [
            { score: "desc" },
            { joinedAt: "asc" },
            { id: "asc" },
        ],
        select: {
            id: true,
            nickname: true,
            avatarId: true,
            score: true,
        },
    });

    return {
        gameId,
        status: "CANCELLED",
        reason: "INSUFFICIENT_PLAYERS",
        finishedAt: now,
        ranking: activePlayers.map((player, index) => ({
            id: player.id,
            nickname: player.nickname,
            avatarId: resolvePlayerAvatarId(player.avatarId),
            score: player.score,
            position: index + 1,
        })),
    };
}
