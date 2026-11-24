import type { Server as HttpServer } from "node:http";
import { performance } from "node:perf_hooks";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import {
    calibrateDbClockOffset,
    getServerNowMs,
    isServerClockCalibrated,
    resetServerClockOffset,
} from "../../src/realtime/server-clock.js";

describe("Sincronização temporal no Backend (HTTP X-Server-Time & Socket time:sync)", () => {
    afterEach(() => {
        resetServerClockOffset();
        vi.restoreAllMocks();
    });

    it("expõe cabeçalho X-Server-Time via CORS em respostas HTTP", async () => {
        const before = Date.now();
        const res = await request(app)
            .get("/")
            .set("Origin", "http://localhost:5173");
        const after = Date.now();

        expect(res.status).toBe(200);
        expect(res.headers["access-control-expose-headers"]).toContain(
            "X-Server-Time",
        );

        const serverTime = Number(res.headers["x-server-time"]);
        expect(Number.isFinite(serverTime)).toBe(true);
        expect(serverTime).toBeGreaterThanOrEqual(before - 50);
        expect(serverTime).toBeLessThanOrEqual(after + 50);
    });

    it("calibra com ponto médio de performance.now() e permanece imune a alterações de Date.now() para trás e para frente", async () => {
        const dbNowMs = 1_800_000_000_000;
        let perfNow = 1_000;
        vi.spyOn(performance, "now").mockImplementation(() => perfNow);

        // Antes da calibração usa Date.now() como fallback para testes isolados
        const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(dbNowMs - 5_000);
        expect(isServerClockCalibrated()).toBe(false);
        expect(getServerNowMs()).toBe(dbNowMs - 5_000);

        await calibrateDbClockOffset(
            async () => {
                perfNow = 1_040; // consulta levou 40ms -> ponto médio em 1_020
                return new Date(dbNowMs);
            },
            () => perfNow,
        );
        expect(isServerClockCalibrated()).toBe(true);
        expect(getServerNowMs()).toBe(dbNowMs + 20);

        // Alterar Date.now() 1 hora para trás NÃO faz getServerNowMs() recuar
        dateNowSpy.mockReturnValue(dbNowMs - 3_600_000);
        perfNow = 6_020; // +4_980ms desde 1_040 (5_000ms desde ponto médio 1_020)
        expect(getServerNowMs()).toBe(dbNowMs + 5_000);

        // Alterar Date.now() 2 horas para frente NÃO provoca salto em getServerNowMs()
        dateNowSpy.mockReturnValue(dbNowMs + 7_200_000);
        perfNow = 11_020; // +5_000ms adicionais
        expect(getServerNowMs()).toBe(dbNowMs + 10_000);

        // Em erro de consulta, mantém a âncora existente sem lançar exceção
        await calibrateDbClockOffset(async () => {
            throw new Error("DB unreachable");
        });
        expect(getServerNowMs()).toBe(dbNowMs + 10_000);
    });

    it("responde evento Socket.IO time:sync com serverTime via ack", async () => {
        const handlers = new Map<string, (...args: unknown[]) => void>();
        let connectionHandler: ((socket: unknown) => void) | null = null;

        vi.resetModules();
        vi.doMock("socket.io", () => ({
            Server: class {
                use = vi.fn();
                on = vi.fn((event: string, fn: (socket: unknown) => void) => {
                    if (event === "connection") {
                        connectionHandler = fn;
                    }
                });
                close = vi.fn();
            },
        }));

        const { createSocketServer } = await import(
            "../../src/realtime/socket.server.js"
        );
        createSocketServer({} as HttpServer);

        expect(connectionHandler).not.toBeNull();
        const fakeSocket = {
            id: "sock-sync-1",
            data: {
                identity: {
                    type: "HOST",
                    userId: "host-1",
                    roomId: "room-1",
                },
            },
            join: vi.fn(),
            emit: vi.fn(),
            on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
                handlers.set(event, fn);
            }),
        };

        connectionHandler!(fakeSocket);

        const timeSyncHandler = handlers.get("time:sync");
        expect(timeSyncHandler).toBeTypeOf("function");

        const ack = vi.fn();
        timeSyncHandler!(ack);

        expect(ack).toHaveBeenCalledTimes(1);
        const payload = ack.mock.calls[0]?.[0] as { serverTime?: unknown };
        expect(typeof payload?.serverTime).toBe("number");
        expect(Number.isFinite(payload?.serverTime)).toBe(true);
    });
});
