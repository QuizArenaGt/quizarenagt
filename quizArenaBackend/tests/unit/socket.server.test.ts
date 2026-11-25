import type { Server as HttpServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    prismaMock,
    middlewareRef,
    closeMock,
    ioInstanceMock,
    serverOptionsSpy,
} = vi.hoisted(() => {
    const middlewareRef: {
        fn:
            | ((
                  socket: Record<string, unknown>,
                  next: (err?: Error) => void,
              ) => Promise<void> | void)
            | null;
    } = { fn: null };
    const closeMock = vi.fn();
    const serverOptionsSpy = vi.fn();
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
        serverOptionsSpy,
        prismaMock: {
            user: { findUnique: vi.fn() },
            room: { findUnique: vi.fn() },
            gamePlayer: { findUnique: vi.fn() },
        },
    };
});

vi.mock("socket.io", () => ({
    Server: class {
        constructor(_httpServer: unknown, options?: unknown) {
            serverOptionsSpy(options);
        }
        use = ioInstanceMock.use;
        on = ioInstanceMock.on;
        close = ioInstanceMock.close;
    },
}));

vi.mock("../../src/database/prisma.js", () => ({
    prisma: prismaMock,
}));

import { createSocketServer, parseAllowedOrigins } from "../../src/realtime/socket.server.js";

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

    it("deve rejeitar handshake de HOST quando o tokenVersion estiver desatualizado", async () => {
        const { JwtService } = await import("../../src/auth/jwt.service.js");
        const jwtService = new JwtService();
        const staleToken = jwtService.generate({
            id: "host-1",
            role: "USER",
            tokenVersion: 0,
        });

        prismaMock.user.findUnique.mockResolvedValue({
            tokenVersion: 1,
        });

        const socket = {
            id: "sock-host-stale",
            handshake: { auth: { token: staleToken, roomCode: "ABC123" } },
            data: {},
        };
        const next = vi.fn();

        await middlewareRef.fn?.(socket, next);

        expect(prismaMock.room.findUnique).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });
});

describe("createSocketServer - configuração de CORS", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFrontendUrl = process.env.FRONTEND_URL;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalFrontendUrl === undefined) {
            delete process.env.FRONTEND_URL;
        } else {
            process.env.FRONTEND_URL = originalFrontendUrl;
        }
    });

    it("usa as mesmas origens normalizadas da configuração HTTP sem wildcard em produção", () => {
        process.env.NODE_ENV = "production";
        process.env.FRONTEND_URL =
            " https://quizarena.vercel.app/ , https://staging.quizarena.vercel.app/// ";

        createSocketServer({} as HttpServer);

        const lastCall = serverOptionsSpy.mock.calls.at(-1)?.[0] as {
            cors: { origin: unknown; methods: string[] };
        };
        expect(lastCall.cors).toEqual({
            origin: [
                "https://quizarena.vercel.app",
                "https://staging.quizarena.vercel.app",
            ],
            methods: ["GET", "POST"],
        });
    });

    it("falha explicitamente ao iniciar Socket.IO em produção sem FRONTEND_URL válida", () => {
        process.env.NODE_ENV = "production";
        delete process.env.FRONTEND_URL;

        expect(() => createSocketServer({} as HttpServer)).toThrow(
            /FRONTEND_URL/i,
        );

        process.env.FRONTEND_URL = "*";
        expect(() => createSocketServer({} as HttpServer)).toThrow(
            /wildcard|FRONTEND_URL/i,
        );
    });
});

describe("parseAllowedOrigins (reexportado por socket.server)", () => {
    it("permite localhost em desenvolvimento quando FRONTEND_URL está ausente ou vazia e falha em produção", () => {
        for (const raw of [undefined, "", "   "]) {
            const devOrigins = parseAllowedOrigins(raw, "development");
            expect(devOrigins).not.toBe("*");
            expect(Array.isArray(devOrigins)).toBe(true);
            expect(
                (devOrigins as RegExp[]).some((pattern) =>
                    pattern.test("http://localhost:5173"),
                ),
            ).toBe(true);

            expect(() => parseAllowedOrigins(raw, "production")).toThrow(
                /FRONTEND_URL/i,
            );
        }
    });

    it("remove espaços e barras finais das origens informadas", () => {
        expect(
            parseAllowedOrigins(
                " https://quizarenagt.vercel.app/ , https://preview.vercel.app/// ",
                "production",
            ),
        ).toEqual([
            "https://quizarenagt.vercel.app",
            "https://preview.vercel.app",
        ]);
    });
});
