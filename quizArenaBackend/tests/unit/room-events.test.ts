import type { Server } from "socket.io";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    disconnectPlayerSockets,
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
});
