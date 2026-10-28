
import type { Request, Response } from "express";
import { UserService } from "../users/user.service.js";
import { EmailAlreadyExistsError } from "../users/user.errors.js";
import { validateRegisterUser } from "./register.dto.js";

export class AuthController {
    constructor(
        private readonly userService = new UserService(),
    ) {}

    async register(req: Request, res: Response): Promise<void> {
        const validation = validateRegisterUser(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: "Dados inválidos.",
                errors: validation.errors,
            });
            return;
        }

        try {
            const user = await this.userService.register(
                validation.data,
            );

            res.status(201).json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            });
        } catch (error: unknown) {
            if (error instanceof EmailAlreadyExistsError) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            // Não retornar detalhes internos, senha ou hash ao cliente.
            console.error("Erro interno ao cadastrar usuário.");

            res.status(500).json({
                message: "Erro interno ao cadastrar usuário.",
            });
        }
    }
}
