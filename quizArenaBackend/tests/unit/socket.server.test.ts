import type { Server as HttpServer } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, middlewareRef, closeMock, ioInstanceMock } = vi.hoisted(
    () => {
        const middlewareRef: {
            fn:
                | ((
                      socket: Record<string, unknown>,
                      next: (err?: Error) => void,
                  ) => Promise<void> | void)
                | null;
        } = { fn: null };
        const closeMock = vi.fn();
        const ioInstanceMock = {
            use: vi.fn((fn) => {
                middlewareRef.fn = fn;
            }),
            on: vi.fn(),
            close: closeMock,
        };

        return {
            middlewareRef,
            closeMock,
            ioInstanceMock,
            prismaMock: {
                room: { findUnique: vi.fn() },
                gamePlayer: { findUnique: vi.fn() },
            },
        };
    },
);

vi.mock("socket.io", () => ({
    Server: class {
        use = ioInstanceMock.use;
        on = ioInstanceMock.on;
        close = ioInstanceMock.close;
    },
}));

vi.mock("../../src/database/prisma.js", () => ({
    prisma: prismaMock,
}));

import { createSocketServer } from "../../src/realtime/socket.server.js";

describe("createSocketServer - elegibilidade do GamePlayer no handshake", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        middlewareRef.fn = null;
        createSocketServer({} as HttpServer);
    });

    it("deve aceitar conexão Socket.IO de participante com status ACTIVE", async () => {
        prismaMock.gamePlayer.findUnique.mockResolvedValue({
            id: "gp-1",
            gameId: "game-1",
            nickname: "Alice",
            status: "ACTIVE",
            sessionTokenHash: "hash-1",
            game: {
                id: "game-1",
                status: "IN_PROGRESS",
                roomId: "room-1",
                room: {
                    id: "room-1",
                    status: "ACTIVE",
                    games: [{ id: "game-1", status: "IN_PROGRESS" }],
                },
            },
        });

        const socket = {
            handshake: { auth: { token: "player-token", code: "ABC123" } },
            data: {},
        };
        const next = vi.fn();

        await middlewareRef.fn?.(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data).toMatchObject({
            identity: {
                type: "PLAYER",
                playerId: "gp-1",
                roomId: "room-1",
            },
        });
    });

    it.each(["LEFT", "ABANDONED"] as const)(
        "deve rejeitar conexão Socket.IO de participante com status %s",
        async (status) => {
            prismaMock.gamePlayer.findUnique.mockResolvedValue({
                id: "gp-inactive",
                gameId: "game-1",
                nickname: "Bob",
                status,
                sessionTokenHash: "hash-2",
                game: {
                    id: "game-1",
                    status: "IN_PROGRESS",
                    roomId: "room-1",
                    room: {
                        id: "room-1",
                        status: "ACTIVE",
                        games: [{ id: "game-1", status: "IN_PROGRESS" }],
                    },
                },
            });

            const socket = {
                handshake: { auth: { token: "inactive-token", code: "ABC123" } },
                data: {},
            };
            const next = vi.fn();

            await middlewareRef.fn?.(socket, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
        },
    );

    it("deve sinalizar RECONNECTING no handshake quando disconnectedAt estiver preenchido no banco", async () => {
        const { PlayerPresenceRegistry } = await import(
            "../../src/realtime/player-presence.js"
        );
        const presenceRegistry = new PlayerPresenceRegistry({
            persistence: {
                markDisconnected: vi.fn().mockResolvedValue(true),
                clearDisconnect: vi.fn().mockResolvedValue(true),
            },
            emitEvent: vi.fn(),
        });
        createSocketServer({} as HttpServer, presenceRegistry);

        prismaMock.gamePlayer.findUnique.mockResolvedValue({
            id: "gp-reconn",
            gameId: "game-1",
            nickname: "Alice",
            status: "ACTIVE",
            disconnectedAt: new Date(Date.now() - 10_000),
            reconnectDeadlineAt: new Date(Date.now() + 50_000),
            sessionTokenHash: "hash-reconn",
            game: {
                id: "game-1",
                status: "IN_PROGRESS",
                roomId: "room-1",
                room: {
                    id: "room-1",
                    status: "ACTIVE",
                    games: [{ id: "game-1", status: "IN_PROGRESS" }],
                },
            },
        });

        const socket = {
            id: "sock-reconn-1",
            handshake: { auth: { token: "reconn-token" } },
            data: {},
        };
        const next = vi.fn();

        await middlewareRef.fn?.(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(presenceRegistry.getPlayerPresence("gp-reconn")).toBe(
            "RECONNECTING",
        );
        expect(socket.data).toMatchObject({
            identity: {
                type: "PLAYER",
                playerId: "gp-reconn",
                wasDisconnectedInDb: true,
            },
        });
    });

    it("deve rejeitar handshake Socket.IO quando reconnectDeadlineAt já expirou mesmo antes do worker rodar", async () => {
        prismaMock.gamePlayer.findUnique.mockResolvedValue({
            id: "gp-expired",
            gameId: "game-1",
            nickname: "Bob",
            status: "ACTIVE",
            disconnectedAt: new Date(Date.now() - 65_000),
            reconnectDeadlineAt: new Date(Date.now() - 5_000),
            sessionTokenHash: "hash-expired",
            game: {
                id: "game-1",
                status: "IN_PROGRESS",
                roomId: "room-1",
                room: {
                    id: "room-1",
                    status: "ACTIVE",
                    games: [{ id: "game-1", status: "IN_PROGRESS" }],
                },
            },
        });

        const socket = {
            id: "sock-expired",
            handshake: { auth: { token: "expired-token" } },
            data: {},
        };
        const next = vi.fn();

        await middlewareRef.fn?.(socket, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });
});
