
import type { Request, Response, NextFunction } from "express";

import { RoomPlayerRepository } from "./room-player.repository.js";
import { hashRoomPlayerSessionToken } from "./room-player-session-token.js";

const roomPlayerRepository = new RoomPlayerRepository();

export async function authenticateRoomPlayer(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        res.status(401).json({
            message: "Autenticação necessária.",
        });
        return;
    }

    const token = authorization.slice(7).trim();

    if (!token) {
        res.status(401).json({
            message: "Token inválido.",
        });
        return;
    }

    try {
        const sessionTokenHash = hashRoomPlayerSessionToken(token);

        const roomPlayer =
            await roomPlayerRepository.findBySessionTokenHash(
                sessionTokenHash,
            );

        if (!roomPlayer) {
            res.status(401).json({
                message: "Sessão de participante inválida.",
            });
            return;
        }

        req.roomPlayer = roomPlayer;

        next();
    } catch {
        res.status(500).json({
            message: "Erro interno ao autenticar participante.",
        });
    }
}
