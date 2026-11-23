import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

import {
    MIN_ELIGIBLE_PLAYERS_TO_CONTINUE,
    cancelInProgressGameIfInsufficientPlayersTx,
} from "../../src/rooms/game-cancellation.js";

function createTxMock() {
    return {
        game: {
            findUnique: vi.fn(),
            updateMany: vi.fn(),
        },
        round: {
            updateMany: vi.fn(),
        },
        gamePlayer: {
            findMany: vi.fn(),
        },
        $queryRaw: vi.fn(),
    };
}

describe("cancelInProgressGameIfInsufficientPlayersTx", () => {
    it("não cancela quando eligiblePlayerCount >= 2", async () => {
        const tx = createTxMock();

        const result = await cancelInProgressGameIfInsufficientPlayersTx(
            tx as unknown as Prisma.TransactionClient,
            "game-1",
            MIN_ELIGIBLE_PLAYERS_TO_CONTINUE,
        );

        expect(result).toBeNull();
        expect(tx.game.findUnique).not.toHaveBeenCalled();
        expect(tx.game.updateMany).not.toHaveBeenCalled();
    });

    it("não altera partida que não está IN_PROGRESS (WAITING, FINISHED, CANCELLED)", async () => {
        for (const status of ["WAITING", "FINISHED", "CANCELLED"] as const) {
            const tx = createTxMock();
            tx.game.findUnique.mockResolvedValue({ id: "game-1", status });

            const result = await cancelInProgressGameIfInsufficientPlayersTx(
                tx as unknown as Prisma.TransactionClient,
                "game-1",
                1,
            );

            expect(result).toBeNull();
            expect(tx.round.updateMany).not.toHaveBeenCalled();
            expect(tx.game.updateMany).not.toHaveBeenCalled();
        }
    });

    it("cancela partida IN_PROGRESS, fecha rodadas OPEN e retorna ranking sem vencedor quando restar 1 ou 0", async () => {
        const now = new Date("2026-11-22T21:10:00.000Z");

        const txOneLeft = createTxMock();
        txOneLeft.game.findUnique.mockResolvedValue({
            id: "game-1",
            status: "IN_PROGRESS",
        });
        txOneLeft.$queryRaw
            .mockResolvedValueOnce([{ now }])
            .mockResolvedValueOnce([{ id: "round-open" }]);
        txOneLeft.round.updateMany.mockResolvedValue({ count: 1 });
        txOneLeft.game.updateMany.mockResolvedValue({ count: 1 });
        txOneLeft.gamePlayer.findMany.mockResolvedValue([
            { id: "gp-2", nickname: "Bob", score: 150 },
        ]);

        const cancelledOne = await cancelInProgressGameIfInsufficientPlayersTx(
            txOneLeft as unknown as Prisma.TransactionClient,
            "game-1",
            1,
        );

        expect(cancelledOne).toEqual({
            gameId: "game-1",
            status: "CANCELLED",
            reason: "INSUFFICIENT_PLAYERS",
            finishedAt: now,
            ranking: [{ id: "gp-2", nickname: "Bob", avatarId: "explorer", score: 150, position: 1 }],
        });

        const txZeroLeft = createTxMock();
        txZeroLeft.game.findUnique.mockResolvedValue({
            id: "game-2",
            status: "IN_PROGRESS",
        });
        txZeroLeft.$queryRaw
            .mockResolvedValueOnce([{ now }])
            .mockResolvedValueOnce([]);
        txZeroLeft.round.updateMany.mockResolvedValue({ count: 0 });
        txZeroLeft.game.updateMany.mockResolvedValue({ count: 1 });
        txZeroLeft.gamePlayer.findMany.mockResolvedValue([]);

        const cancelledZero = await cancelInProgressGameIfInsufficientPlayersTx(
            txZeroLeft as unknown as Prisma.TransactionClient,
            "game-2",
            0,
        );

        expect(cancelledZero).toEqual({
            gameId: "game-2",
            status: "CANCELLED",
            reason: "INSUFFICIENT_PLAYERS",
            finishedAt: now,
            ranking: [],
        });
    });

    it("retorna null de forma idempotente se updateMany condicional não atualizar (corrida com FINISHED/CANCELLED)", async () => {
        const now = new Date("2026-11-22T21:10:00.000Z");
        const tx = createTxMock();
        tx.game.findUnique.mockResolvedValue({
            id: "game-1",
            status: "IN_PROGRESS",
        });
        tx.$queryRaw
            .mockResolvedValueOnce([{ now }])
            .mockResolvedValueOnce([]);
        tx.round.updateMany.mockResolvedValue({ count: 0 });
        tx.game.updateMany.mockResolvedValue({ count: 0 });

        const result = await cancelInProgressGameIfInsufficientPlayersTx(
            tx as unknown as Prisma.TransactionClient,
            "game-1",
            1,
        );

        expect(result).toBeNull();
        expect(tx.gamePlayer.findMany).not.toHaveBeenCalled();
    });
});
