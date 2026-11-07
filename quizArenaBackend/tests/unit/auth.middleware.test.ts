
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { sign } from "jsonwebtoken";

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
        req = {
            headers: {},
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };

        next = vi.fn();
    });

    it("deve autenticar uma requisição com token válido", () => {
        const token = sign(
            { role: "USER" },
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

        authenticateToken(
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

    it("deve retornar 401 quando o token estiver ausente", () => {
        authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o formato Bearer estiver incorreto", () => {
        req.headers = {
            authorization: "Basic token-invalido",
        };

        authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando o token for inválido", () => {
        req.headers = {
            authorization: "Bearer token-invalido",
        };

        authenticateToken(
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

    it("deve retornar 401 quando o token estiver expirado", () => {
        const token = sign(
            { role: "USER" },
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

        authenticateToken(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
