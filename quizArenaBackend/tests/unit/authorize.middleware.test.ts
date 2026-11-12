import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

import { authorizeRoles } from "../../src/auth/authorize.middleware.js";

describe("authorizeRoles", () => {
    let req: Partial<Request>;
    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };
    let next: NextFunction;

    beforeEach(() => {
        req = {};
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        next = vi.fn();
    });

    it("deve permitir o acesso quando o usuário possuir o papel ADMIN", () => {
        req.user = {
            id: "admin-123",
            role: Role.ADMIN,
        };

        const middleware = authorizeRoles(Role.ADMIN);

        middleware(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("deve retornar 403 quando o usuário possuir o papel USER", () => {
        req.user = {
            id: "user-123",
            role: Role.USER,
        };

        const middleware = authorizeRoles(Role.ADMIN);

        middleware(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            message: "Acesso negado. Permissão insuficiente.",
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 403 quando o usuário possuir o papel HOST", () => {
        req.user = {
            id: "host-123",
            role: Role.HOST,
        };

        const middleware = authorizeRoles(Role.ADMIN);

        middleware(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("deve retornar 401 quando req.user não estiver definido", () => {
        const middleware = authorizeRoles(Role.ADMIN);

        middleware(
            req as Request,
            res as unknown as Response,
            next,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            message: "Autenticação necessária.",
        });
        expect(next).not.toHaveBeenCalled();
    });
});
