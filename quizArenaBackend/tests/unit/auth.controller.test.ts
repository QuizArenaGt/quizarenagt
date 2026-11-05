
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { Request, Response } from "express";

import { AuthController } from "../../src/auth/auth.controller.js";
import { EmailAlreadyExistsError } from "../../src/users/user.errors.js";
import type { UserService } from "../../src/users/user.service.js";

describe("AuthController", () => {
    let userService: {
        register: ReturnType<typeof vi.fn>;
    };

    let controller: AuthController;
    let req: Partial<Request>;
    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        userService = {
            register: vi.fn(),
        };

        controller = new AuthController(
            userService as unknown as UserService,
        );

        req = {
            body: {
                name: "João Silva",
                email: "joao@email.com",
                password: "12345678",
            },
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("deve retornar 400 quando os dados forem inválidos", async () => {
        req.body = {
            name: "",
            email: "email-invalido",
            password: "123",
        };

        await controller.register(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Dados inválidos.",
                errors: expect.any(Object),
            }),
        );

        expect(userService.register).not.toHaveBeenCalled();
    });

    it("deve cadastrar usuário e retornar 201", async () => {
        const createdUser = {
            id: "user-123",
            name: "João Silva",
            email: "joao@email.com",
            role: "USER",
            password: "hash-secreto",
            createdAt: new Date("2026-11-05T12:00:00.000Z"),
            updatedAt: new Date("2026-11-05T12:00:00.000Z"),
        };

        userService.register.mockResolvedValue(createdUser);

        await controller.register(
            req as Request,
            res as unknown as Response,
        );

        expect(userService.register).toHaveBeenCalledWith({
            name: "João Silva",
            email: "joao@email.com",
            password: "12345678",
        });

        expect(res.status).toHaveBeenCalledWith(201);

        expect(res.json).toHaveBeenCalledWith({
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            role: createdUser.role,
            createdAt: createdUser.createdAt,
        });

        expect(res.json).not.toHaveBeenCalledWith(
            expect.objectContaining({
                password: expect.anything(),
            }),
        );
    });

    it("deve retornar 409 quando o e-mail já estiver cadastrado", async () => {
        userService.register.mockRejectedValue(
            new EmailAlreadyExistsError(),
        );

        await controller.register(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            message: expect.any(String),
        });
    });

    it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
        const internalError = new Error("Detalhes internos do banco");
        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => { });

        userService.register.mockRejectedValue(internalError);

        await controller.register(
            req as Request,
            res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(500);

        expect(res.json).toHaveBeenCalledWith({
            message: "Erro interno ao cadastrar usuário.",
        });

        expect(JSON.stringify(res.json.mock.calls))
            .not.toContain("Detalhes internos do banco");

        expect(consoleSpy).toHaveBeenCalled();
    });
});
