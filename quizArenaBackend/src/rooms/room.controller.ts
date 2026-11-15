import type { Request, Response } from "express";

import { RoomService } from "./room.service.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
} from "./room.errors.js";


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

}
