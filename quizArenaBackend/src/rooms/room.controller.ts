import type { Request, Response } from "express";

import { RoomService } from "./room.service.js";
import { InvalidRoomDataError } from "./room.errors.js";

export class RoomController {
    constructor(
        private readonly roomService = new RoomService(),
    ) {}

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
}
