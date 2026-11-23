
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

type SocketIdentityData = {
    type?: string;
    playerId?: string;
    userId?: string;
    roomId?: string;
};

type DisconnectableSocket = {
    data?: {
        identity?: unknown;
    };
    leave: (room: string) => unknown;
    disconnect: (close?: boolean) => unknown;
};

async function closeMatchingSockets(
    channel: string,
    getRoomsToLeave: (socket: DisconnectableSocket) => string[],
    shouldDisconnect: (socket: DisconnectableSocket) => boolean,
): Promise<void> {
    if (!socketServer || typeof socketServer.in !== "function") {
        return;
    }

    const sockets = await socketServer.in(channel).fetchSockets();

    for (const socket of sockets) {
        if (!shouldDisconnect(socket)) {
            continue;
        }

        for (const room of getRoomsToLeave(socket)) {
            socket.leave(room);
        }
        socket.disconnect(true);
    }
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

    const roomChannel = `room:${roomId}`;

    await closeMatchingSockets(
        roomChannel,
        () => [roomChannel],
        (socket) => {
            const identity = socket.data?.identity as
                | SocketIdentityData
                | undefined;
            return (
                identity?.type === "PLAYER" &&
                identity.playerId === playerId
            );
        },
    );
}

/**
 * Encerra todas as conexões Socket.IO ativas de um usuário autenticado
 * após alteração ou redefinição de senha, sem afetar demais usuários.
 */
export async function disconnectUserSockets(
    userId: string,
): Promise<void> {
    const userChannel = `user:${userId}`;

    await closeMatchingSockets(
        userChannel,
        (socket) => {
            const identity = socket.data?.identity as
                | SocketIdentityData
                | undefined;
            const rooms: string[] = [];
            if (identity?.roomId) {
                rooms.push(`room:${identity.roomId}`);
            }
            rooms.push(userChannel);
            return rooms;
        },
        (socket) => {
            const identity = socket.data?.identity as
                | SocketIdentityData
                | undefined;
            return (
                identity?.type === "HOST" &&
                identity.userId === userId
            );
        },
    );
}

/**
 * Executa disconnectUserSockets em modo best-effort após a persistência da
 * alteração/redefinição de senha, registrando falhas sem reverter ou mascarar
 * o sucesso já gravado no banco (tokenVersion já foi incrementado).
 */
export async function disconnectUserSocketsSafely(
    userId: string,
    disconnectFn: (userId: string) => Promise<void> = disconnectUserSockets,
): Promise<void> {
    try {
        await disconnectFn(userId);
    } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(
            "Falha ao encerrar conexões Socket.IO após atualização de senha:",
            reason,
        );
    }
}
