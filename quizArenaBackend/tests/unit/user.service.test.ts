
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compare, getRounds } from "bcryptjs";
import type { User } from "@prisma/client";

import { UserService } from "../../src/users/user.service.js";
import { EmailAlreadyExistsError } from "../../src/users/user.errors.js";
import type { RegisterUserDto } from "../../src/auth/register.dto.js";
import type { UserRepository } from "../../src/users/user.repository.js";

type Repository = Pick<UserRepository, "findByEmail" | "create">;

const userFixture = {
    id: "user-test-uuid",
    name: "João Silva",
    email: "joao@email.com",
    password: "$2b$12$hashDeTeste",
    role: "USER",
    createdAt: new Date("2026-11-04T12:00:00.000Z"),
    updatedAt: new Date("2026-11-04T12:00:00.000Z"),
} as User;

const validData: RegisterUserDto = {
    name: "João Silva",
    email: "joao@email.com",
    password: "12345678",
};

describe("UserService", () => {
    let repository: {
        findByEmail: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
    };

    let service: UserService;

    beforeEach(() => {
        repository = {
            findByEmail: vi.fn(),
            create: vi.fn(),
        };

        service = new UserService(repository as Repository);
    });

    it("deve cadastrar usuário com senha criptografada", async () => {
        repository.findByEmail.mockResolvedValue(null);
        repository.create.mockImplementation(async (data) => ({
            ...userFixture,
            ...data,
        }));

        const result = await service.register(validData);

        expect(repository.findByEmail).toHaveBeenCalledWith(validData.email);
        expect(repository.create).toHaveBeenCalledTimes(1);

        const persistedData = repository.create.mock.calls[0][0];

        expect(persistedData.password).not.toBe(validData.password);
        expect(getRounds(persistedData.password)).toBe(12);
        expect(await compare(validData.password, persistedData.password)).toBe(true);

        expect(result.email).toBe(validData.email);
    });

    it("não deve cadastrar e-mail já existente", async () => {
        repository.findByEmail.mockResolvedValue(userFixture);

        await expect(service.register(validData))
            .rejects.toBeInstanceOf(EmailAlreadyExistsError);

        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve converter violação de unicidade do e-mail em erro de duplicidade", async () => {
        repository.findByEmail.mockResolvedValue(null);

        repository.create.mockRejectedValue({
            code: "P2002",
            meta: {
                target: ["email"],
            },
        });

        await expect(service.register(validData))
            .rejects.toBeInstanceOf(EmailAlreadyExistsError);
    });

    it("deve reconhecer o campo email quando o Prisma retorna target como string", async () => {
        repository.findByEmail.mockResolvedValue(null);

        repository.create.mockRejectedValue({
            code: "P2002",
            meta: {
                target: "email",
            },
        });

        await expect(service.register(validData))
            .rejects.toBeInstanceOf(EmailAlreadyExistsError);
    });

    it("deve propagar erros inesperados do repositório", async () => {
        const databaseError = new Error("Falha de conexão");

        repository.findByEmail.mockResolvedValue(null);
        repository.create.mockRejectedValue(databaseError);

        await expect(service.register(validData))
            .rejects.toBe(databaseError);
    });

    it("não deve converter violações de unicidade de outros campos em duplicidade de e-mail", async () => {
        const databaseError = {
            code: "P2002",
            meta: {
                target: ["name"],
            },
        };

        repository.findByEmail.mockResolvedValue(null);
        repository.create.mockRejectedValue(databaseError);

        await expect(service.register(validData))
            .rejects.toBe(databaseError);
    });
});
