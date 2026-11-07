
import type { Request, Response } from "express";
import { UserService } from "../users/user.service.js";
import {
    EmailAlreadyExistsError,
    InvalidCredentialsError,
} from "../users/user.errors.js";
import { AuthService } from "./auth.service.js";
import { JwtService } from "./jwt.service.js";
import { validateRegisterUser } from "./register.dto.js";
import { validateLogin } from "./login.dto.js";

export class AuthController {
    constructor(
        private readonly userService = new UserService(),
        private readonly authService = new AuthService(),
        private readonly jwtService = new JwtService(),
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

            console.error("Erro interno ao cadastrar usuário.");

            res.status(500).json({
                message: "Erro interno ao cadastrar usuário.",
            });
        }
    }

    async login(req: Request, res: Response): Promise<void> {
        const validation = validateLogin(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: "Dados inválidos.",
                errors: validation.errors,
            });
            return;
        }

        try {
            const user = await this.authService.authenticate(
                validation.data,
            );

            const token = this.jwtService.generate({
                id: user.id,
                role: user.role,
            });

            res.status(200).json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            });
        } catch (error: unknown) {
            if (error instanceof InvalidCredentialsError) {
                res.status(401).json({
                    message: "E-mail ou senha incorretos.",
                });
                return;
            }

            console.error("Erro interno ao autenticar usuário.");

            res.status(500).json({
                message: "Erro interno ao autenticar usuário.",
            });
        }
    }
}
