
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

import { JwtService } from "../auth/jwt.service.js";
import { hashRoomPlayerSessionToken } from "../rooms/room-player-session-token.js";
import { prisma } from "../database/prisma.js";
import { setSocketServer } from "./room-events.js";

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
        roomId: string;
    };

export function createSocketServer(httpServer: HttpServer): Server {
    const jwtService = new JwtService();

    const io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL?.split(",") ?? "*",
            methods: ["GET", "POST"],
        },
    });
    
    setSocketServer(io);

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
                if (
                    typeof auth.roomCode !== "string" ||
                    !/^[A-Z0-9]{6}$/i.test(auth.roomCode)
                ) {
                    return next(new Error("Código da sala inválido."));
                }

                const room = await prisma.room.findUnique({
                    where: {
                        code: auth.roomCode.toUpperCase(),
                    },
                    select: {
                        id: true,
                        hostId: true,
                    },
                });

                if (!room || room.hostId !== payload.sub) {
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

            // Autenticação de jogador via token de sessão.
            const sessionTokenHash =
                hashRoomPlayerSessionToken(token);

            const player = await prisma.roomPlayer.findUnique({
                where: {
                    sessionTokenHash,
                },
                include: {
                    room: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            if (!player || !player.sessionTokenHash) {
                return next(new Error("Sessão de participante inválida."));
            }

            const identity: SocketIdentity = {
                type: "PLAYER",
                playerId: player.id,
                nickname: player.nickname,
                roomId: player.room.id,
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

        console.log(
            `Socket conectado: ${identity.type} - ${socket.id}`,
        );

        socket.on("disconnect", (reason) => {
            console.log(
                `Socket desconectado: ${socket.id} - ${reason}`,
            );
        });
    });

    return io;
}
