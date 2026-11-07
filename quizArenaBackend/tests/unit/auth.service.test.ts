
import { beforeEach, describe, expect, it} from "vitest";
import { hash } from "bcryptjs";
import type { User } from "@prisma/client";

import { AuthService } from "../../src/auth/auth.service.js";
import { InvalidCredentialsError } from "../../src/users/user.errors.js";
import { vi, type Mock } from "vitest";

describe("AuthService", () => {
    let findByEmail: Mock<(email: string) => Promise<User | null>>;
    let authService: AuthService;
    let user: User;

    beforeEach(async () => {
        const passwordHash = await hash("Senha123", 4);

        user = {
            id: "user-uuid-123",
            name: "João Silva",
            email: "joao@email.com",
            password: passwordHash,
            role: "USER",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as User;

        findByEmail = vi.fn().mockResolvedValue(user);

        authService = new AuthService({
            findByEmail,
        });
    });

    it("deve autenticar usuário com credenciais corretas", async () => {
        const result = await authService.authenticate({
            email: "joao@email.com",
            password: "Senha123",
        });

        expect(result).toEqual(user);
        expect(findByEmail).toHaveBeenCalledWith("joao@email.com");
    });

    it("deve rejeitar autenticação quando o usuário não existe", async () => {
        findByEmail.mockResolvedValue(null);

        await expect(
            authService.authenticate({
                email: "inexistente@email.com",
                password: "Senha123",
            }),
        ).rejects.toThrow(InvalidCredentialsError);
    });

    it("deve rejeitar autenticação quando a senha está incorreta", async () => {
        await expect(
            authService.authenticate({
                email: "joao@email.com",
                password: "SenhaErrada",
            }),
        ).rejects.toThrow(InvalidCredentialsError);
    });

    it("deve propagar erros inesperados do repositório", async () => {
        const databaseError = new Error("Database connection failed");

        findByEmail.mockRejectedValue(databaseError);

        await expect(
            authService.authenticate({
                email: "joao@email.com",
                password: "Senha123",
            }),
        ).rejects.toThrow(databaseError);
    });
});
