
import type { Request, Response } from "express";
import { UserService } from "../users/user.service.js";

const userService = new UserService();

export class AuthController {
    async register(req: Request, res: Response): Promise<void> {
        try {
            const { name, email, password } = req.body;

            const errors: Record<string, string> = {};

            if (typeof name !== "string" || !name.trim()) {
                errors.name = "O nome é obrigatório.";
            }

            if (
                typeof email !== "string" ||
                !email.trim()
            ) {
                errors.email = "O e-mail é obrigatório.";
            } else if (
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
            ) {
                errors.email = "Informe um e-mail válido.";
            }

            if (typeof password !== "string" || !password) {
                errors.password = "A senha é obrigatória.";
            }

            if (Object.keys(errors).length > 0) {
                res.status(400).json({
                    message: "Dados inválidos.",
                    errors,
                });
                return;
            }

            const user = await userService.register({
                name: name.trim(),
                email: email.trim(),
                password,
            });

            res.status(201).json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            });
        } catch (error) {
            if (
                error instanceof Error &&
                error.message === "E-mail já cadastrado."
            ) {
                res.status(409).json({
                    message: error.message,
                });
                return;
            }

            console.error("Erro ao cadastrar usuário:", error);

            res.status(500).json({
                message: "Erro interno ao cadastrar usuário.",
            });
        }
    }
}
