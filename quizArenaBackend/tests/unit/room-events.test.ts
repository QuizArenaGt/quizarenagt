import type { Server } from "socket.io";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    disconnectPlayerSockets,
    disconnectUserSockets,
    disconnectUserSocketsSafely,
    emitRoomEvent,
    setSocketServer,
} from "../../src/realtime/room-events.js";

describe("room-events", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("disconnectPlayerSockets desconecta apenas os sockets do jogador que saiu sem afetar outros participantes ou o host", async () => {
        const leavingSocket = {
            data: { identity: { type: "PLAYER", playerId: "gp-leaving" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };
        const stayingSocket = {
            data: { identity: { type: "PLAYER", playerId: "gp-staying" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };
        const hostSocket = {
            data: { identity: { type: "HOST", userId: "host-1" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };

        const emitMock = vi.fn();
        const fetchSocketsMock = vi.fn().mockResolvedValue([
            leavingSocket,
            stayingSocket,
            hostSocket,
        ]);
        const inMock = vi.fn().mockReturnValue({ fetchSockets: fetchSocketsMock });
        const toMock = vi.fn().mockReturnValue({ emit: emitMock });

        setSocketServer({
            in: inMock,
            to: toMock,
        } as unknown as Server);

        await disconnectPlayerSockets("room-1", "gp-leaving");

        expect(inMock).toHaveBeenCalledWith("room:room-1");
        expect(leavingSocket.leave).toHaveBeenCalledWith("room:room-1");
        expect(leavingSocket.disconnect).toHaveBeenCalledWith(true);
        expect(stayingSocket.leave).not.toHaveBeenCalled();
        expect(stayingSocket.disconnect).not.toHaveBeenCalled();
        expect(hostSocket.leave).not.toHaveBeenCalled();
        expect(hostSocket.disconnect).not.toHaveBeenCalled();

        emitRoomEvent("room-1", "player:left", { roomId: "room-1" });
        expect(toMock).toHaveBeenCalledWith("room:room-1");
        expect(emitMock).toHaveBeenCalledWith("player:left", { roomId: "room-1" });
    });

    it("disconnectUserSockets desconecta apenas os sockets do usuário afetado sem afetar demais usuários ou jogadores", async () => {
        const affectedHostTab1 = {
            data: { identity: { type: "HOST", userId: "host-1", roomId: "room-1" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };
        const affectedHostTab2 = {
            data: { identity: { type: "HOST", userId: "host-1", roomId: "room-2" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };
        const otherHostSocket = {
            data: { identity: { type: "HOST", userId: "host-2", roomId: "room-3" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };
        const playerSocket = {
            data: { identity: { type: "PLAYER", playerId: "gp-1", roomId: "room-1" } },
            leave: vi.fn(),
            disconnect: vi.fn(),
        };

        const emitMock = vi.fn();
        const fetchSocketsMock = vi.fn().mockResolvedValue([
            affectedHostTab1,
            affectedHostTab2,
            otherHostSocket,
            playerSocket,
        ]);
        const inMock = vi.fn().mockReturnValue({ fetchSockets: fetchSocketsMock });
        const toMock = vi.fn().mockReturnValue({ emit: emitMock });

        setSocketServer({
            in: inMock,
            to: toMock,
        } as unknown as Server);

        await disconnectUserSockets("host-1");

        expect(inMock).toHaveBeenCalledWith("user:host-1");
        expect(affectedHostTab1.leave).toHaveBeenCalledWith("room:room-1");
        expect(affectedHostTab1.leave).toHaveBeenCalledWith("user:host-1");
        expect(affectedHostTab1.disconnect).toHaveBeenCalledWith(true);

        expect(affectedHostTab2.leave).toHaveBeenCalledWith("room:room-2");
        expect(affectedHostTab2.leave).toHaveBeenCalledWith("user:host-1");
        expect(affectedHostTab2.disconnect).toHaveBeenCalledWith(true);

        expect(otherHostSocket.disconnect).not.toHaveBeenCalled();
        expect(playerSocket.disconnect).not.toHaveBeenCalled();

        emitRoomEvent("room-3", "room:updated", { roomId: "room-3" });
        expect(toMock).toHaveBeenCalledWith("room:room-3");
        expect(emitMock).toHaveBeenCalledWith("room:updated", { roomId: "room-3" });
    });

    it("disconnectUserSocketsSafely registra erro e não propaga falha quando a desconexão falha", async () => {
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        await expect(
            disconnectUserSocketsSafely("host-1", async () => {
                throw new Error("Socket adapter indisponível");
            }),
        ).resolves.toBeUndefined();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Falha ao encerrar conexões Socket.IO após atualização de senha:",
            "Socket adapter indisponível",
        );

        consoleErrorSpy.mockRestore();
    });
});
