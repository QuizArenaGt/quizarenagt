
import type { Server } from "socket.io";

let socketServer: Server | null = null;

export function setSocketServer(io: Server): void {
    socketServer = io;
}

export function emitRoomEvent(
    roomId: string,
    event: string,
    payload: unknown,
): void {
    socketServer
        ?.to(`room:${roomId}`)
        .emit(event, payload);
}
