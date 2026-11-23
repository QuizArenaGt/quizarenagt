
import type { Request, Response, NextFunction } from "express";

import { RoomPlayerRepository } from "./room-player.repository.js";
import { hashRoomPlayerSessionToken } from "./room-player-session-token.js";
import { isGamePlayerActive } from "./game-player-eligibility.js";
import { getPlayerPresenceRegistry } from "../realtime/room-events.js";

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

        const gamePlayer =
            await roomPlayerRepository.findBySessionTokenHash(
                sessionTokenHash,
            );

        if (
            !gamePlayer ||
            !gamePlayer.sessionTokenHash ||
            !gamePlayer.game ||
            !gamePlayer.game.room ||
            gamePlayer.game.room.status !== "ACTIVE" ||
            !isGamePlayerActive(gamePlayer)
        ) {
            res.status(401).json({
                message: "Sessão de participante inválida.",
            });
            return;
        }

        if (
            gamePlayer.reconnectDeadlineAt &&
            gamePlayer.reconnectDeadlineAt.getTime() <= Date.now() &&
            (getPlayerPresenceRegistry()?.getActiveSocketCount(
                gamePlayer.id,
            ) ?? 0) === 0
        ) {
            res.status(401).json({
                message: "Prazo de reconexão expirado.",
            });
            return;
        }

        const roomGames = gamePlayer.game.room.games ?? [];
        const currentGame =
            roomGames.find(
                (game) =>
                    game.status === "WAITING" ||
                    game.status === "IN_PROGRESS",
            ) ?? roomGames[0];

        if (!currentGame || currentGame.id !== gamePlayer.gameId) {
            res.status(401).json({
                message: "Sessão de participante expirada ou pertencente a outra partida.",
            });
            return;
        }

        req.roomPlayer = {
            ...gamePlayer,
            roomId: gamePlayer.game.roomId,
        };

        next();
    } catch {
        res.status(500).json({
            message: "Erro interno ao autenticar participante.",
        });
    }
}
