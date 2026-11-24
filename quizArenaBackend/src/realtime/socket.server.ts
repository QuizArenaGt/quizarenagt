
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

import { JwtService } from "../auth/jwt.service.js";
import { isValidRoomCode, normalizeRoomCode } from "../rooms/join-room.dto.js";
import { hashRoomPlayerSessionToken } from "../rooms/room-player-session-token.js";
import { isGamePlayerActive } from "../rooms/game-player-eligibility.js";
import { selectCurrentGame } from "../rooms/room.repository.js";
import { prisma } from "../database/prisma.js";
import { PlayerPresenceRegistry } from "./player-presence.js";
import { setSocketServer } from "./room-events.js";
import { getServerNowMs } from "./server-clock.js";

type SocketIdentity =
    | {
        type: "HOST";
        userId: string;
        roomId: string;
    }
    | {
        type: "PLAYER";
        playerId: string;
        nickname: string;
        gameId: string;
        roomId: string;
        wasDisconnectedInDb: boolean;
    };

export function createSocketServer(
    httpServer: HttpServer,
    presenceRegistry = new PlayerPresenceRegistry(),
): Server {
    const jwtService = new JwtService();

    const io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL?.split(",") ?? "*",
            methods: ["GET", "POST"],
        },
    });
    
    setSocketServer(io, presenceRegistry);

    io.use(async (socket, next) => {
        try {
            const auth = socket.handshake.auth as {
                token?: unknown;
                roomCode?: unknown;
            };

            if (
                typeof auth.token !== "string" ||
                !auth.token.trim()
            ) {
                return next(new Error("Autenticação necessária."));
            }

            const token = auth.token.trim();

            // Tenta validar como host. Falha no JWT não impede
            // a tentativa de autenticação por token de jogador.
            let payload: ReturnType<JwtService["verify"]> | null = null;

            try {
                payload = jwtService.verify(token);
            } catch {
                payload = null;
            }

            if (payload) {
                const hostUser = await prisma.user.findUnique({
                    where: { id: payload.sub },
                    select: { tokenVersion: true },
                });

                if (
                    !hostUser ||
                    hostUser.tokenVersion !== (payload.tv ?? 0)
                ) {
                    return next(new Error("Token inválido ou expirado."));
                }

                const normalizedRoomCode =
                    typeof auth.roomCode === "string"
                        ? normalizeRoomCode(auth.roomCode)
                        : "";

                if (!isValidRoomCode(normalizedRoomCode)) {
                    return next(new Error("Código da sala inválido."));
                }

                const room = await prisma.room.findUnique({
                    where: {
                        code: normalizedRoomCode,
                    },
                    select: {
                        id: true,
                        hostId: true,
                        status: true,
                    },
                });

                if (
                    !room ||
                    room.hostId !== payload.sub ||
                    room.status !== "ACTIVE"
                ) {
                    return next(new Error("Acesso à sala não autorizado."));
                }

                const identity: SocketIdentity = {
                    type: "HOST",
                    userId: payload.sub,
                    roomId: room.id,
                };

                socket.data.identity = identity;
                return next();
            }

            // Autenticação de jogador via token de sessão vinculado à partida ativa.
            const sessionTokenHash =
                hashRoomPlayerSessionToken(token);

            const player = await prisma.gamePlayer.findUnique({
                where: {
                    sessionTokenHash,
                },
                include: {
                    game: {
                        select: {
                            id: true,
                            status: true,
                            roomId: true,
                            room: {
                                select: {
                                    id: true,
                                    status: true,
                                    games: {
                                        orderBy: [
                                            { createdAt: "desc" },
                                            { id: "desc" },
                                        ],
                                        select: {
                                            id: true,
                                            status: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (
                !player ||
                !player.sessionTokenHash ||
                !player.game ||
                !player.game.room ||
                player.game.room.status !== "ACTIVE" ||
                !isGamePlayerActive(player)
            ) {
                return next(new Error("Sessão de participante inválida."));
            }

            const currentGame = selectCurrentGame(player.game.room.games);

            if (
                !currentGame ||
                currentGame.id !== player.gameId ||
                (currentGame.status !== "WAITING" &&
                    currentGame.status !== "IN_PROGRESS")
            ) {
                return next(new Error("Sessão de participante expirada."));
            }

            if (
                player.reconnectDeadlineAt &&
                player.reconnectDeadlineAt.getTime() <= getServerNowMs() &&
                presenceRegistry.getActiveSocketCount(player.id) === 0
            ) {
                return next(new Error("Prazo de reconexão expirado."));
            }

            const wasDisconnectedInDb =
                player.disconnectedAt !== null &&
                player.disconnectedAt !== undefined;

            if (wasDisconnectedInDb) {
                presenceRegistry.markReconnecting(
                    player.id,
                    typeof socket.id === "string" && socket.id
                        ? socket.id
                        : "handshake",
                );
            }

            const identity: SocketIdentity = {
                type: "PLAYER",
                playerId: player.id,
                nickname: player.nickname,
                gameId: player.gameId,
                roomId: player.game.roomId,
                wasDisconnectedInDb,
            };

            socket.data.identity = identity;
            return next();
        } catch (error: unknown) {
            console.error("Erro na autenticação Socket.IO:", error);
            return next(new Error("Falha ao autenticar conexão."));
        }
    });

    io.on("connection", (socket) => {
        const identity = socket.data.identity as SocketIdentity;

        socket.join(`room:${identity.roomId}`);

        if (identity.type === "HOST") {
            socket.join(`user:${identity.userId}`);
        }

        if (identity.type === "PLAYER") {
            presenceRegistry.handleSocketConnected({
                playerId: identity.playerId,
                nickname: identity.nickname,
                gameId: identity.gameId,
                roomId: identity.roomId,
                socketId: socket.id,
                wasDisconnectedInDb: identity.wasDisconnectedInDb,
                onRejected: () => {
                    socket.leave(`room:${identity.roomId}`);
                    socket.disconnect(true);
                },
            });
        }

        socket.emit("realtime:connected", {
            roomId: identity.roomId,
            role: identity.type,
            ...(identity.type === "PLAYER"
                ? {
                    playerId: identity.playerId,
                    nickname: identity.nickname,
                }
                : {
                    userId: identity.userId,
                }),
        });

        socket.on("time:sync", (ack?: unknown) => {
            if (typeof ack === "function") {
                (ack as (payload: { serverTime: number }) => void)({
                    serverTime: getServerNowMs(),
                });
            }
        });

        console.log(
            `Socket conectado: ${identity.type} - ${socket.id}`,
        );

        socket.on("disconnect", (reason) => {
            if (identity.type === "PLAYER") {
                presenceRegistry.handleSocketDisconnected({
                    playerId: identity.playerId,
                    nickname: identity.nickname,
                    gameId: identity.gameId,
                    roomId: identity.roomId,
                    socketId: socket.id,
                });
            }

            console.log(
                `Socket desconectado: ${socket.id} - ${reason}`,
            );
        });
    });

    return io;
}
