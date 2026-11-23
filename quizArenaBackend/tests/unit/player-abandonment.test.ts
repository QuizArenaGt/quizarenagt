import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerPresenceRegistry } from "../../src/realtime/player-presence.js";
import { PlayerAbandonmentService } from "../../src/rooms/player-abandonment.service.js";
import { RoundExpirationWorker } from "../../src/rounds/round-expiration.worker.js";

describe("PlayerAbandonmentService, Worker & Anti-Race Presence", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("processExpiredAbandonments emite player:left, desconecta sockets e dispara tryCloseRoundIfReady apenas para abandonos efetivos", async () => {
        const findExpiredCandidateIds = vi
            .fn()
            .mockResolvedValue(["gp-abandoned", "gp-reconnected"]);
        const abandonExpiredPlayer = vi
            .fn()
            .mockResolvedValueOnce({
                abandoned: true,
                roomId: "room-1",
                gameId: "game-1",
                gameStatus: "IN_PROGRESS",
                player: {
                    id: "gp-abandoned",
                    nickname: "Carol",
                    status: "ABANDONED",
                    score: 125,
                },
                eligiblePlayerCount: 2,
                openRoundId: "round-open-2",
                cancelledGame: null,
            })
            .mockResolvedValueOnce({
                abandoned: false,
                reason: "ALREADY_RECONNECTED",
            });

        const tryCloseRoundIfReady = vi.fn().mockResolvedValue(null);
        const emitEvent = vi.fn();
        const disconnectSockets = vi.fn().mockResolvedValue(undefined);
        const hasActiveSocket = vi.fn().mockReturnValue(false);

        const service = new PlayerAbandonmentService(
            { findExpiredCandidateIds, abandonExpiredPlayer },
            { tryCloseRoundIfReady },
            emitEvent,
            disconnectSockets,
            hasActiveSocket,
        );

        const count = await service.processExpiredAbandonments();

        expect(count).toBe(1);
        expect(disconnectSockets).toHaveBeenCalledWith("room-1", "gp-abandoned");
        expect(emitEvent).toHaveBeenCalledTimes(1);
        expect(emitEvent).toHaveBeenCalledWith("room-1", "player:left", {
            roomId: "room-1",
            gameId: "game-1",
            gameStatus: "IN_PROGRESS",
            player: {
                id: "gp-abandoned",
                nickname: "Carol",
                status: "ABANDONED",
                score: 125,
            },
            eligiblePlayerCount: 2,
        });
        expect(tryCloseRoundIfReady).toHaveBeenCalledWith("round-open-2");
    });

    it("processExpiredAbandonments emite game:finished CANCELLED após player:left e pula tryCloseRoundIfReady quando restar menos de 2 elegíveis", async () => {
        const finishedAt = new Date("2026-11-22T21:05:00.000Z");
        const findExpiredCandidateIds = vi.fn().mockResolvedValue(["gp-last"]);
        const abandonExpiredPlayer = vi.fn().mockResolvedValue({
            abandoned: true,
            roomId: "room-1",
            gameId: "game-1",
            gameStatus: "IN_PROGRESS",
            player: {
                id: "gp-last",
                nickname: "Bob",
                status: "ABANDONED",
                score: 50,
            },
            eligiblePlayerCount: 1,
            openRoundId: null,
            cancelledGame: {
                gameId: "game-1",
                status: "CANCELLED",
                reason: "INSUFFICIENT_PLAYERS",
                finishedAt,
                ranking: [
                    { id: "gp-alice", nickname: "Alice", score: 120, position: 1 },
                ],
            },
        });

        const tryCloseRoundIfReady = vi.fn();
        const emitEvent = vi.fn();
        const disconnectSockets = vi.fn().mockResolvedValue(undefined);
        const hasActiveSocket = vi.fn().mockReturnValue(false);

        const service = new PlayerAbandonmentService(
            { findExpiredCandidateIds, abandonExpiredPlayer },
            { tryCloseRoundIfReady },
            emitEvent,
            disconnectSockets,
            hasActiveSocket,
        );

        const count = await service.processExpiredAbandonments();

        expect(count).toBe(1);
        expect(emitEvent).toHaveBeenNthCalledWith(
            1,
            "room-1",
            "player:left",
            expect.objectContaining({ eligiblePlayerCount: 1 }),
        );
        expect(emitEvent).toHaveBeenNthCalledWith(2, "room-1", "game:finished", {
            roomId: "room-1",
            gameId: "game-1",
            status: "CANCELLED",
            reason: "INSUFFICIENT_PLAYERS",
            finishedAt,
            ranking: [
                { id: "gp-alice", nickname: "Alice", score: 120, position: 1 },
            ],
        });
        expect(tryCloseRoundIfReady).not.toHaveBeenCalled();
    });

    it("RoundExpirationWorker executa varredura de abandono no boot e respeita intervalo configurado entre verificações", async () => {
        vi.useFakeTimers();
        const processExpiredRounds = vi.fn().mockResolvedValue(0);
        const processExpiredAbandonments = vi.fn().mockResolvedValue(1);

        const worker = new RoundExpirationWorker(
            { processExpiredRounds },
            1000,
            { processExpiredAbandonments },
            5000,
        );

        worker.start();
        await Promise.resolve();

        expect(processExpiredRounds).toHaveBeenCalledTimes(1);
        expect(processExpiredAbandonments).toHaveBeenCalledTimes(1);

        // Avança 3s -> rodadas rodam 3x, abandono não roda antes de 5s
        await vi.advanceTimersByTimeAsync(3100);
        expect(processExpiredRounds).toHaveBeenCalledTimes(4);
        expect(processExpiredAbandonments).toHaveBeenCalledTimes(1);

        // Passando dos 5s -> abandono executa novamente
        await vi.advanceTimersByTimeAsync(2000);
        expect(processExpiredAbandonments).toHaveBeenCalledTimes(2);

        await worker.stop();
    });

    it("PlayerPresenceRegistry rejeita reconexão tardia se clearDisconnect retornar false (prazo expirado ou ABANDONED)", async () => {
        const emitEvent = vi.fn();
        const onRejected = vi.fn();
        const registry = new PlayerPresenceRegistry({
            persistence: {
                markDisconnected: vi.fn().mockResolvedValue(true),
                clearDisconnect: vi.fn().mockResolvedValue(false),
            },
            emitEvent,
        });

        registry.handleSocketConnected({
            playerId: "gp-late",
            nickname: "Bob",
            gameId: "game-1",
            roomId: "room-1",
            socketId: "sock-late",
            wasDisconnectedInDb: true,
            onRejected,
        });
        await registry.whenIdle("gp-late");

        expect(onRejected).toHaveBeenCalledTimes(1);
        expect(registry.getActiveSocketCount("gp-late")).toBe(0);
        expect(registry.getPlayerPresence("gp-late")).toBe("DISCONNECTED");
        expect(emitEvent).not.toHaveBeenCalled();
    });
});
