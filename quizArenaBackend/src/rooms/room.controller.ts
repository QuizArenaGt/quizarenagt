import type { Request, Response } from "express";

import { RoomService } from "./room.service.js";
import { isValidRoomCode, normalizeRoomCode } from "./join-room.dto.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
    RoomReplayNotAllowedError,
    RoomNotJoinableError,
    RoomFullError,
    DuplicateNicknameError,
    RoomAuthenticationError,
    RoomStartRequirementsError,
    RoomGameNotFoundError,
} from "./room.errors.js";
import {
    disconnectPlayerSockets,
    emitRoomEvent,
} from "../realtime/room-events.js";
import { RoundService } from "../rounds/round.service.js";

type RoundAutoCloseContract = Pick<RoundService, "tryCloseRoundIfReady">;

export class RoomController {
    constructor(
        private readonly roomService = new RoomService(),
        private readonly roundService: RoundAutoCloseContract =
            new RoundService(),
    ) { }

    async create(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        try {
            const payload =
                req.body && typeof req.body === "object" && !Array.isArray(req.body)
                    ? { ...req.body, hostId: req.user.id }
                    : req.body;
            const room = await this.roomService.createRoom(payload);

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

    async listByHost(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        try {
            const rooms = await this.roomService.listHostRooms(
                req.user.id,
            );

            res.status(200).json({
                rooms,
            });
        } catch {
            console.error("Erro interno ao listar salas do host.");

            res.status(500).json({
                message: "Erro interno ao listar salas.",
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

            if (error instanceof RoomNotEditableError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            if (error instanceof RoomStartRequirementsError) {
                res.status(409).json({
                    message: error.message,
                    code: error.reason,
                    ...(error.details ? { requirements: error.details } : {}),
                });
                return;
            }

            console.error("Erro interno ao iniciar partida.");

            res.status(500).json({
                message: "Erro interno ao iniciar partida.",
            });
        }
    }

    async playAgain(req: Request, res: Response): Promise<void> {
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
            const room = await this.roomService.playAgain(
                roomId,
                req.user.id,
            );

            emitRoomEvent(room.id, "game:created", {
                roomId: room.id,
                status: room.status,
                maxPlayers: room.maxPlayers,
                questionTime: room.questionTime,
                gameMode: room.gameMode,
                currentGame: room.currentGame,
            });

            res.status(201).json(room);
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
                error instanceof RoomReplayNotAllowedError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao preparar nova partida.");

            res.status(500).json({
                message: "Erro interno ao preparar nova partida.",
            });
        }
    }

    async finish(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.params.id;

        if (typeof roomId !== "string" || !roomId.trim()) {
            res.status(400).json({
                message: "Identificador da sala inválido.",
            });
            return;
        }

        try {
            const result = await this.roomService.finishRoom(
                roomId,
                req.user.id,
            );

            if (!result.alreadyFinished) {
                if (result.closedRoundPayload) {
                    emitRoomEvent(
                        result.room.id,
                        "round:closed",
                        result.closedRoundPayload,
                    );
                }

                emitRoomEvent(result.room.id, "game:finished", {
                    roomId: result.room.id,
                    gameId: result.gameId,
                    finishedAt: result.finishedAt,
                    ranking: result.ranking,
                });
            }

            res.status(200).json({
                message: "Partida encerrada com sucesso.",
                room: result.room,
                ranking: result.ranking,
                alreadyFinished: result.alreadyFinished,
            });
        } catch (error: unknown) {
            if (
                error instanceof RoomNotFoundError ||
                error instanceof RoomGameNotFoundError
            ) {
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

            console.error("Erro interno ao encerrar partida.");

            res.status(500).json({
                message: "Erro interno ao encerrar partida.",
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

    async checkAvailability(req: Request, res: Response): Promise<void> {
        const code = req.params.code;
        const normalizedCode =
            typeof code === "string" ? normalizeRoomCode(code) : "";

        if (!isValidRoomCode(normalizedCode)) {
            res.status(400).json({
                message: "Código da sala inválido.",
            });
            return;
        }

        try {
            const availability =
                await this.roomService.checkRoomAvailability(normalizedCode);

            res.status(200).json({
                room: availability,
            });
        } catch (error: unknown) {
            if (error instanceof InvalidRoomDataError) {
                res.status(400).json({
                    message: error.message,
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
                error instanceof RoomFullError
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao verificar disponibilidade da sala.");

            res.status(500).json({
                message: "Erro interno ao verificar disponibilidade da sala.",
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
                room,
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

            if (error instanceof RoomNotEditableError) {
                res.status(409).json({
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

    async archive(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.params.id;

        if (typeof roomId !== "string" || !roomId.trim()) {
            res.status(400).json({
                message: "Identificador da sala inválido.",
            });
            return;
        }

        try {
            const room = await this.roomService.archiveRoom(
                roomId,
                req.user.id,
            );

            emitRoomEvent(room.id, "room:archived", {
                roomId: room.id,
                roomStatus: room.roomStatus,
                archivedAt: room.archivedAt,
            });

            res.status(200).json({
                message: "Sala arquivada com sucesso.",
                room,
            });
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

            console.error("Erro interno ao excluir sala.");

            res.status(500).json({
                message: "Erro interno ao excluir sala.",
            });
        }
    }

    async listGames(req: Request, res: Response): Promise<void> {
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
            const games = await this.roomService.listRoomGames(
                roomId,
                req.user.id,
            );

            res.status(200).json({
                games,
            });
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

            console.error("Erro interno ao consultar histórico de partidas.");

            res.status(500).json({
                message: "Erro interno ao consultar histórico de partidas.",
            });
        }
    }

    async getGameResults(req: Request, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        const roomId = req.params.id;
        const gameId = req.params.gameId;

        if (typeof roomId !== "string" || typeof gameId !== "string") {
            res.status(400).json({
                message: "Identificador da sala ou da partida inválido.",
            });
            return;
        }

        try {
            const game = await this.roomService.getGameResults(
                roomId,
                gameId,
                req.user.id,
            );

            res.status(200).json({
                game,
            });
        } catch (error: unknown) {
            if (
                error instanceof RoomNotFoundError ||
                error instanceof RoomGameNotFoundError
            ) {
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

            console.error("Erro interno ao consultar resultados da partida.");

            res.status(500).json({
                message: "Erro interno ao consultar resultados da partida.",
            });
        }
    }

    async leave(req: Request, res: Response): Promise<void> {
        if (!req.roomPlayer) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        try {
            const result = await this.roomService.leaveRoom(
                req.roomPlayer.id,
                req.roomPlayer.roomId,
            );

            await disconnectPlayerSockets(result.roomId, result.player.id);

            emitRoomEvent(result.roomId, "player:left", {
                roomId: result.roomId,
                gameId: result.gameId,
                gameStatus: result.gameStatus,
                player: result.player,
                eligiblePlayerCount: result.eligiblePlayerCount,
            });

            if (result.cancelledGame) {
                emitRoomEvent(result.roomId, "game:finished", {
                    roomId: result.roomId,
                    gameId: result.cancelledGame.gameId,
                    status: result.cancelledGame.status,
                    reason: result.cancelledGame.reason,
                    finishedAt: result.cancelledGame.finishedAt,
                    ranking: result.cancelledGame.ranking,
                });
            } else if (result.openRoundId) {
                try {
                    await this.roundService.tryCloseRoundIfReady(
                        result.openRoundId,
                    );
                } catch (closeError: unknown) {
                    console.error(
                        "Falha não crítica ao verificar encerramento antecipado da rodada após saída:",
                        closeError,
                    );
                }
            }

            res.status(200).json({
                message: "Você saiu da sala.",
                roomId: result.roomId,
                gameId: result.gameId,
                gameStatus: result.gameStatus,
                player: result.player,
                eligiblePlayerCount: result.eligiblePlayerCount,
                gameCancelled: Boolean(result.cancelledGame),
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

            if (error instanceof RoomNotEditableError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro interno ao sair da sala.");

            res.status(500).json({
                message: "Erro interno ao sair da sala.",
            });
        }
    }

}
