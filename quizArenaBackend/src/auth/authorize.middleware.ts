import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

export function authorizeRoles(...allowedRoles: Role[]) {
    const rolesToCheck =
        allowedRoles.length > 0 ? allowedRoles : [Role.ADMIN];

    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                message: "Autenticação necessária.",
            });
            return;
        }

        if (!rolesToCheck.includes(req.user.role)) {
            res.status(403).json({
                message: "Acesso negado. Permissão insuficiente.",
            });
            return;
        }

        next();
    };
}

export const requireRole = authorizeRoles;
