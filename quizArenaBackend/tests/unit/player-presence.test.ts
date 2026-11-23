import { describe, expect, it, vi } from "vitest";

import {
    PlayerPresenceRegistry,
    RECONNECT_GRACE_PERIOD_MS,
    type PlayerPresencePersistence,
} from "../../src/realtime/player-presence.js";

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe("PlayerPresenceRegistry", () => {
    const baseIdentity = {
        playerId: "gp-1",
        nickname: "Alice",
        gameId: "game-1",
        roomId: "room-1",
    };

    function createRegistry(options?: {
        persistence?: PlayerPresencePersistence;
        nowMs?: number;
    }) {
        let currentMs = options?.nowMs ?? Date.parse("2026-11-22T20:00:00.000Z");
        const emitEvent = vi.fn();
        const persistence: PlayerPresencePersistence = options?.persistence ?? {
            markDisconnected: vi.fn().mockResolvedValue(true),
            clearDisconnect: vi.fn().mockResolvedValue(true),
        };

        const registry = new PlayerPresenceRegistry({
            persistence,
            emitEvent,
            gracePeriodMs: RECONNECT_GRACE_PERIOD_MS,
            now: () => new Date(currentMs),
        });

        return {
            registry,
            emitEvent,
            persistence,
            advanceMs: (delta: number) => {
                currentMs += delta;
            },
        };
    }

    it("conexão inicial registra ONLINE, emite player:connected e ignora conexões duplicadas sem reemitir evento", async () => {
        const { registry, emitEvent, persistence } = createRegistry();

        expect(registry.getPlayerPresence("gp-1")).toBe("DISCONNECTED");

        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-1" });
        await registry.whenIdle("gp-1");

        expect(registry.getActiveSocketCount("gp-1")).toBe(1);
        expect(registry.getPlayerPresence("gp-1")).toBe("ONLINE");
        expect(persistence.clearDisconnect).not.toHaveBeenCalled();
        expect(emitEvent).toHaveBeenCalledTimes(1);
        expect(emitEvent).toHaveBeenCalledWith(
            "room-1",
            "player:connected",
            expect.objectContaining({
                roomId: "room-1",
                gameId: "game-1",
                presence: "ONLINE",
                player: { id: "gp-1", nickname: "Alice", status: "ACTIVE" },
            }),
        );

        // Segundo socket simultâneo (ex.: múltiplas abas ou sobreposição no F5)
        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-2" });
        await registry.whenIdle("gp-1");

        expect(registry.getActiveSocketCount("gp-1")).toBe(2);
        expect(emitEvent).toHaveBeenCalledTimes(1);
    });

    it("desconectar um socket mantendo outro ativo mantém ONLINE e não grava desconexão nem emite evento", async () => {
        const { registry, emitEvent, persistence } = createRegistry();

        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-1" });
        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-2" });
        await registry.whenIdle("gp-1");
        emitEvent.mockClear();

        registry.handleSocketDisconnected({ ...baseIdentity, socketId: "sock-1" });
        await registry.whenIdle("gp-1");

        expect(registry.getActiveSocketCount("gp-1")).toBe(1);
        expect(registry.getPlayerPresence("gp-1")).toBe("ONLINE");
        expect(persistence.markDisconnected).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();

        // Desconectar agora o último socket persiste janela de 60s e emite player:disconnected
        registry.handleSocketDisconnected({ ...baseIdentity, socketId: "sock-2" });
        await registry.whenIdle("gp-1");

        expect(registry.getActiveSocketCount("gp-1")).toBe(0);
        expect(registry.getPlayerPresence("gp-1")).toBe("DISCONNECTED");
        expect(persistence.markDisconnected).toHaveBeenCalledTimes(1);
        const [id, disconnectedAt, deadline] = (
            persistence.markDisconnected as ReturnType<typeof vi.fn>
        ).mock.calls[0] as [string, Date, Date];
        expect(id).toBe("gp-1");
        expect(deadline.getTime() - disconnectedAt.getTime()).toBe(60_000);
        expect(emitEvent).toHaveBeenCalledWith(
            "room-1",
            "player:disconnected",
            expect.objectContaining({
                presence: "DISCONNECTED",
                disconnectedAt: disconnectedAt.toISOString(),
                reconnectDeadlineAt: deadline.toISOString(),
            }),
        );
    });

    it("reconexão dentro da tolerância transiciona DISCONNECTED -> RECONNECTING -> ONLINE, limpa timestamps no banco e emite player:reconnected", async () => {
        const { registry, emitEvent, persistence } = createRegistry();

        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-1" });
        registry.handleSocketDisconnected({ ...baseIdentity, socketId: "sock-1" });
        await registry.whenIdle("gp-1");
        emitEvent.mockClear();

        // Durante handshake da nova conexão
        registry.markReconnecting("gp-1", "sock-2");
        expect(registry.getPlayerPresence("gp-1")).toBe("RECONNECTING");

        registry.handleSocketConnected({
            ...baseIdentity,
            socketId: "sock-2",
            wasDisconnectedInDb: true,
        });
        await registry.whenIdle("gp-1");

        expect(registry.getPlayerPresence("gp-1")).toBe("ONLINE");
        expect(registry.getActiveSocketCount("gp-1")).toBe(1);
        expect(persistence.clearDisconnect).toHaveBeenCalledWith("gp-1");
        expect(emitEvent).toHaveBeenCalledTimes(1);
        expect(emitEvent).toHaveBeenCalledWith(
            "room-1",
            "player:reconnected",
            expect.objectContaining({
                presence: "ONLINE",
                player: { id: "gp-1", nickname: "Alice", status: "ACTIVE" },
            }),
        );
    });

    it("corrida em F5 rápido: conexão nova durante persistência da desconexão antiga não permite que socket antigo sobrescreva presença", async () => {
        const markDeferred = createDeferred<boolean>();
        const persistence: PlayerPresencePersistence = {
            markDisconnected: vi.fn().mockImplementation(() => markDeferred.promise),
            clearDisconnect: vi.fn().mockResolvedValue(true),
        };
        const { registry, emitEvent } = createRegistry({ persistence });

        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-1" });
        await registry.whenIdle("gp-1");
        emitEvent.mockClear();

        // sock-1 cai e inicia escrita no banco (aguardando I/O no banco)
        registry.handleSocketDisconnected({ ...baseIdentity, socketId: "sock-1" });
        await Promise.resolve();
        await Promise.resolve();
        expect(persistence.markDisconnected).toHaveBeenCalledTimes(1);

        // Enquanto markDisconnected ainda está aguardando I/O, sock-2 chega (F5 rápido)
        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-2" });

        // Agora o I/O de markDisconnected resolve true
        markDeferred.resolve(true);
        await registry.whenIdle("gp-1");

        expect(registry.getActiveSocketCount("gp-1")).toBe(1);
        expect(registry.getPlayerPresence("gp-1")).toBe("ONLINE");
        // Auto-correção limpa eventual timestamp gravado e não emite player:disconnected
        expect(persistence.clearDisconnect).toHaveBeenCalledWith("gp-1");
        expect(emitEvent).not.toHaveBeenCalledWith(
            "room-1",
            "player:disconnected",
            expect.anything(),
        );
    });

    it("saída voluntária suprimida não registra desconexão inesperada nem emite player:disconnected", async () => {
        const { registry, emitEvent, persistence } = createRegistry();

        registry.handleSocketConnected({ ...baseIdentity, socketId: "sock-1" });
        await registry.whenIdle("gp-1");
        emitEvent.mockClear();

        registry.suppressPlayer("gp-1");
        registry.handleSocketDisconnected({ ...baseIdentity, socketId: "sock-1" });
        await registry.whenIdle("gp-1");

        expect(registry.getActiveSocketCount("gp-1")).toBe(0);
        expect(persistence.markDisconnected).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });
});
