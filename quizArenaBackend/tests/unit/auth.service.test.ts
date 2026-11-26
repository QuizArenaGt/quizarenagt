
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

    it("deve normalizar o e-mail antes de buscar o usuário no authenticate", async () => {
        const result = await authService.authenticate({
            email: "  JOAO@EMAIL.COM ",
            password: "Senha123",
        });

        expect(result).toEqual(user);
        expect(findByEmail).toHaveBeenCalledWith("joao@email.com");
    });

    it("deve autenticar usuário legado cuja senha não atende às novas regras de força", async () => {
        const legacyUser = {
            ...user,
            password: await hash("123", 4),
        } as User;
        findByEmail.mockResolvedValueOnce(legacyUser);

        const result = await authService.authenticate({
            email: "joao@email.com",
            password: "123",
        });

        expect(result).toEqual(legacyUser);
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

    it("changePassword só desconecta sockets após persistir nova senha e não falha se a desconexão lançar erro", async () => {
        const updatedUser = {
            ...user,
            tokenVersion: 1,
        } as User;
        const callOrder: string[] = [];

        const findById = vi.fn().mockResolvedValue(user);
        const updatePasswordAndBumpTokenVersion = vi.fn(async () => {
            callOrder.push("db-update");
            return updatedUser;
        });
        const disconnectSockets = vi.fn(async () => {
            callOrder.push("disconnect-sockets");
            throw new Error("Erro transitório no Socket.IO");
        });
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        const serviceWithSocketFail = new AuthService(
            {
                findByEmail,
                findById,
                updatePasswordAndBumpTokenVersion,
            },
            disconnectSockets,
        );

        const result = await serviceWithSocketFail.changePassword(user.id, {
            currentPassword: "Senha123",
            newPassword: "NovaSenha456",
        });

        expect(callOrder).toEqual(["db-update", "disconnect-sockets"]);
        expect(result).toEqual(updatedUser);
        expect(disconnectSockets).toHaveBeenCalledWith(user.id);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Falha ao encerrar conexões Socket.IO após atualização de senha:",
            "Erro transitório no Socket.IO",
        );

        consoleErrorSpy.mockRestore();
    });
});
