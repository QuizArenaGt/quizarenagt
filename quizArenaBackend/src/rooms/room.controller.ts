import type { Request, Response } from "express";

import { RoomService } from "./room.service.js";
import { isValidRoomCode, normalizeRoomCode } from "./join-room.dto.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
    RoomNotJoinableError,
    RoomFullError,
    DuplicateNicknameError,
    RoomAuthenticationError,
    RoomStartRequirementsError,
} from "./room.errors.js";
import { emitRoomEvent } from "../realtime/room-events.js";

export class RoomController {
    constructor(
        private readonly roomService = new RoomService(),
    ) { }

    async create(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        try {
            const room = await this.roomService.createRoom({
                ...req.body,
                hostId: req.user.id,
            });

            res.status(201).json(room);
        } catch (error: unknown) {
            if (error instanceof InvalidRoomDataError) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors: error.errors,
                });
                return;
            }

            console.error("Erro interno ao criar sala.");

            res.status(500).json({
                message: "Erro interno ao criar sala.",
            });
        }
    }


    async update(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.params.id;

        if (typeof roomId !== "string") {
            res.status(400).json({
                message: "Identificador da sala inválido.",
            });
            return;
        }

        try {
            const room = await this.roomService.updateRoom({
                roomId,
                hostId: req.user.id,
                data: req.body,
            });

            emitRoomEvent(room.id, "room:updated", {
                roomId: room.id,
                maxPlayers: room.maxPlayers,
                questionTime: room.questionTime,
                gameMode: room.gameMode,
            });

            res.status(200).json(room);
        } catch (error: unknown) {
            if (error instanceof InvalidRoomDataError) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors: error.errors,
                });
                return;
            }

            if (error instanceof RoomNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoomAccessDeniedError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoomNotEditableError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao atualizar sala.");

            res.status(500).json({
                message: "Erro interno ao atualizar sala.",
            });
        }
    }

    async start(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.params.id;

        if (typeof roomId !== "string") {
            res.status(400).json({
                message: "Identificador da sala inválido.",
            });
            return;
        }

        try {
            const room = await this.roomService.startRoom(
                roomId,
                req.user.id,
            );

            emitRoomEvent(room.id, "game:started", {
                roomId: room.id,
                status: room.status,
            });

            res.status(200).json(room);
        } catch (error: unknown) {
            if (error instanceof RoomNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoomAccessDeniedError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            if (
                error instanceof RoomNotEditableError ||
                error instanceof RoomStartRequirementsError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao iniciar partida.");

            res.status(500).json({
                message: "Erro interno ao iniciar partida.",
            });
        }
    }

    async join(req: Request, res: Response): Promise<void> {
        try {
            const result = await this.roomService.joinRoom(req.body);

            emitRoomEvent(result.player.roomId, "player:joined", {
                roomId: result.player.roomId,
                player: {
                    id: result.player.id,
                    nickname: result.player.nickname,
                    score: result.player.score,
                    joinedAt: result.player.joinedAt,
                },
            });

            res.status(201).json(result);
        } catch (error: unknown) {
            if (error instanceof InvalidRoomDataError) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors: error.errors,
                });
                return;
            }

            if (error instanceof RoomNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (
                error instanceof RoomNotJoinableError ||
                error instanceof RoomFullError ||
                error instanceof DuplicateNicknameError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao entrar na sala.");

            res.status(500).json({
                message: "Erro interno ao entrar na sala.",
            });
        }
    }


    async getLobby(req: Request, res: Response): Promise<void> {
        const code = req.params.code;
        const authorization = req.headers.authorization;
        const normalizedCode =
            typeof code === "string" ? normalizeRoomCode(code) : "";

        if (!isValidRoomCode(normalizedCode)) {
            res.status(400).json({
                message: "Código da sala inválido.",
            });
            return;
        }

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
            const room = await this.roomService.getRoomLobby(
                normalizedCode,
                token,
            );

            res.status(200).json({
                room: {
                    id: room.id,
                    code: room.code,
                    status: room.status,
                    gameMode: room.gameMode,
                    maxPlayers: room.maxPlayers,
                    questionTime: room.questionTime,
                    createdAt: room.createdAt,
                    host: room.host,
                    players: room.players,
                    playerCount: room.players.length,
                },
            });
        } catch (error: unknown) {
            if (error instanceof RoomAuthenticationError) {
                res.status(401).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoomNotFoundError) {
                res.status(404).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoomAccessDeniedError) {
                res.status(403).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao consultar lobby.");

            res.status(500).json({
                message: "Erro interno ao consultar lobby.",
            });
        }
    }


}
