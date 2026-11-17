import type { Request, Response, NextFunction } from "express";
import { JwtService } from "./jwt.service.js";

const jwtService = new JwtService();

export function authenticateToken(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const authorization = req.headers.authorization;

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
        const payload = jwtService.verify(token);

        req.user = {
            id: payload.sub,
            role: payload.role,
        };

        next();
    } catch {
        res.status(401).json({
            message: "Token inválido ou expirado.",
        });
    }
}