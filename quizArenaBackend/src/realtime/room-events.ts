
import type { Server } from "socket.io";
import type { PlayerPresenceRegistry } from "./player-presence.js";

let socketServer: Server | null = null;
let playerPresenceRegistry: PlayerPresenceRegistry | null = null;

export function setSocketServer(
    io: Server,
    presenceRegistry?: PlayerPresenceRegistry | null,
): void {
    socketServer = io;
    if (presenceRegistry !== undefined) {
        playerPresenceRegistry = presenceRegistry;
    }
}

export function getPlayerPresenceRegistry(): PlayerPresenceRegistry | null {
    return playerPresenceRegistry;
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

/**
 * Remove o participante que saiu voluntariamente dos canais ativos da sala
 * e encerra seus sockets para que não receba eventos futuros.
 */
export async function disconnectPlayerSockets(
    roomId: string,
    playerId: string,
): Promise<void> {
    playerPresenceRegistry?.suppressPlayer(playerId);

    if (!socketServer || typeof socketServer.in !== "function") {
        return;
    }

    const sockets = await socketServer.in(`room:${roomId}`).fetchSockets();

    for (const socket of sockets) {
        const identity = socket.data?.identity as
            | { type?: string; playerId?: string }
            | undefined;

        if (identity?.type === "PLAYER" && identity.playerId === playerId) {
            socket.leave(`room:${roomId}`);
            socket.disconnect(true);
        }
    }
}
