
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";

type TokenUser = {
    id: string;
    role: Role;
};

type AuthenticatedTokenPayload = JwtPayload & {
    sub: string;
    role: Role;
};

const VALID_ROLES = ["USER", "ADMIN", "HOST"] as const;

function isValidRole(role: unknown): role is Role {
    return VALID_ROLES.includes(role as (typeof VALID_ROLES)[number]);
}

export class JwtService {
    private readonly secret: string;
    private readonly expiresIn: NonNullable<SignOptions["expiresIn"]>;

    constructor(
        secret = process.env.JWT_SECRET,
        expiresIn: NonNullable<SignOptions["expiresIn"]> =
            (process.env.JWT_EXPIRES_IN ?? "1h") as NonNullable<SignOptions["expiresIn"]>,
    ) {
        if (!secret || secret.length < 32) {
            throw new Error(
                "JWT_SECRET não configurado ou muito curto. Utilize uma chave de pelo menos 32 caracteres.",
            );
        }

        this.secret = secret;
        this.expiresIn = expiresIn;
    }

    generate(user: TokenUser): string {
        return jwt.sign(
            { role: user.role },
            this.secret,
            {
                subject: user.id,
                expiresIn: this.expiresIn,
                algorithm: "HS256",
            },
        );
    }

    verify(token: string): AuthenticatedTokenPayload {
        const decoded = jwt.verify(token, this.secret, {
            algorithms: ["HS256"],
        });

        if (
            typeof decoded === "string" ||
            typeof decoded.sub !== "string" ||
            !isValidRole(decoded.role)
        ) {
            throw new Error("Token inválido.");
        }

        return decoded as AuthenticatedTokenPayload;
    }
}
