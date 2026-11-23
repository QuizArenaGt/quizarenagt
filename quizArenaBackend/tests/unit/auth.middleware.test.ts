
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { sign } from "jsonwebtoken";

const { findUserMock } = vi.hoisted(() => ({
    findUserMock: vi.fn(),
}));

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        user: {
            findUnique: findUserMock,
        },
    },
}));

import { authenticateToken } from "../../src/auth/auth.middleware.js";

describe("authenticateToken", () => {
    type AuthenticatedRequest = Request & {
        user?: {
            id: string;
            role: "USER" | "ADMIN" | "HOST";
        };
    };

    let req: Partial<AuthenticatedRequest>;
    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };
    let next: NextFunction;

    const secret = process.env.JWT_SECRET!;

    beforeEach(() => {
        vi.clearAllMocks();

        findUserMock.mockResolvedValue({
            id: "user-123",
            role: "USER",
            tokenVersion: 0,
        });

        req = {
            headers: {},
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };

        next = vi.fn();
    });

    it("deve autenticar uma requisição com token válido", async () => {
        const token = sign(
            { role: "USER", tv: 0 },
            secret,
            {
                subject: "user-123",
                expiresIn: "1h",
                algorithm: "HS256",
            },
        );

        req.headers = {
            authorization: `Bearer ${token}`,
        };

        await authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(req.user).toEqual({
            id: "user-123",
            role: "USER",
        });

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o token estiver ausente", async () => {
        await authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o formato Bearer estiver incorreto", async () => {
        req.headers = {
            authorization: "Basic token-invalido",
        };

        await authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        req.headers = {
            authorization: "Bearer token-invalido",
        };

        await authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            message: "Token inválido ou expirado.",
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o token estiver expirado", async () => {
        const token = sign(
            { role: "USER", tv: 0 },
            secret,
            {
                subject: "user-123",
                expiresIn: "0s",
                algorithm: "HS256",
            },
        );

        req.headers = {
            authorization: `Bearer ${token}`,
        };

        await authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o tokenVersion tiver sido invalidado após alteração de senha", async () => {
        findUserMock.mockResolvedValue({
            id: "user-123",
            role: "USER",
            tokenVersion: 1,
        });

        const token = sign(
            { role: "USER", tv: 0 },
            secret,
            {
                subject: "user-123",
                expiresIn: "1h",
                algorithm: "HS256",
            },
        );

        req.headers = {
            authorization: `Bearer ${token}`,
        };

        await authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            message: "Token inválido ou expirado.",
        });
        expect(next).not.toHaveBeenCalled();
    });
});
