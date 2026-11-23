import type { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma.js";
import { JwtService } from "./jwt.service.js";

const jwtService = new JwtService();

export async function authenticateToken(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
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

        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                role: true,
                tokenVersion: true,
            },
        });

        if (!user || user.tokenVersion !== (payload.tv ?? 0)) {
            res.status(401).json({
                message: "Token inválido ou expirado.",
            });
            return;
        }

        req.user = {
            id: user.id,
            role: user.role,
        };

        next();
    } catch {
        res.status(401).json({
            message: "Token inválido ou expirado.",
        });
    }
}