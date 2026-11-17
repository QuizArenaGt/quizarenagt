import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { compare, hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { UserRepository } from "../../src/users/user.repository.js";

describe("POST /auth/register - Integração", () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        "teste.repository@email.com",
                        "joao@email.com",
                        "maria@email.com",
                    ],
                },
            },
        });
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        "teste.repository@email.com",
                        "joao@email.com",
                        "maria@email.com",
                    ],
                },
            },
        });

        await prisma.$disconnect();
    });

    it("deve retornar status de funcionamento na rota inicial", async () => {
        const response = await request(app).get("/");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "ok",
            message: "Backend rodando com sucesso!",
        });
    });

    it("deve encontrar um usuário pelo ID", async () => {
        const repository = new UserRepository();

        const createdUser = await prisma.user.create({
            data: {
                name: "Usuário de Teste",
                email: "teste.repository@email.com",
                password: "hash_de_teste",
            },
        });

        const foundUser = await repository.findById(createdUser.id);

        expect(foundUser).not.toBeNull();
        expect(foundUser?.id).toBe(createdUser.id);
        expect(foundUser?.email).toBe(createdUser.email);
    });
    it("deve cadastrar um usuário e persistir os dados no PostgreSQL", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "João Silva",
                email: "joao@email.com",
                password: "12345678",
            });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            name: "João Silva",
            email: "joao@email.com",
            role: "USER",
        });

        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("createdAt");
        expect(response.body).not.toHaveProperty("password");

        const user = await prisma.user.findUnique({
            where: { email: "joao@email.com" },
        });

        expect(user).not.toBeNull();
        expect(user?.name).toBe("João Silva");
        expect(user?.role).toBe("USER");
        expect(user?.password).not.toBe("12345678");
        expect(await compare("12345678", user!.password)).toBe(true);
    });

    it("deve retornar 400 quando os dados forem inválidos", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "",
                email: "email-invalido",
                password: "123",
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body).toHaveProperty("errors");
    });

    it("deve retornar 409 quando o e-mail já estiver cadastrado", async () => {
        const userData = {
            name: "João Silva",
            email: "joao@email.com",
            password: "12345678",
        };

        await request(app)
            .post("/auth/register")
            .send(userData)
            .expect(201);

        const response = await request(app)
            .post("/auth/register")
            .send(userData);

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty("message");
    });

    it("não deve cadastrar dois usuários com o mesmo e-mail em requisições simultâneas", async () => {
        const userData = {
            name: "Maria Silva",
            email: "maria@email.com",
            password: "12345678",
        };

        const responses = await Promise.all([
            request(app).post("/auth/register").send(userData),
            request(app).post("/auth/register").send(userData),
        ]);

        const statuses = responses.map((response) => response.status).sort();

        expect(statuses).toEqual([201, 409]);

        const users = await prisma.user.findMany({
            where: { email: userData.email },
        });

        expect(users).toHaveLength(1);
    });

    it("deve retornar 400 quando os dados de login forem inválidos", async () => {
        const response = await request(app)
            .post("/auth/login")
            .send({
                email: "email-invalido",
                password: "",
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body).toHaveProperty("errors");
    });

    it("deve retornar 200 ao acessar /auth/me com token válido", async () => {
        const password = "12345678";

        const user = await prisma.user.create({
            data: {
                name: "João Silva",
                email: "joao@email.com",
                password: await hash(password, 12),
            },
        });

        const loginResponse = await request(app)
            .post("/auth/login")
            .send({
                email: user.email,
                password,
            });

        const token = loginResponse.body.token;

        const response = await request(app)
            .get("/auth/me")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            id: user.id,
            role: user.role,
        });
    });

    it("deve retornar 401 ao acessar /auth/me sem token", async () => {
        const response = await request(app).get("/auth/me");

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message");
    });

    it("deve retornar 401 ao acessar /auth/me com token inválido", async () => {
        const response = await request(app)
            .get("/auth/me")
            .set("Authorization", "Bearer token-invalido");

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message");
    });

    it("deve autenticar usuário com credenciais válidas e retornar JWT", async () => {
        const password = "12345678";

        await prisma.user.create({
            data: {
                name: "João Silva",
                email: "joao@email.com",
                password: await hash(password, 12),
            },
        });

        const response = await request(app)
            .post("/auth/login")
            .send({
                email: "joao@email.com",
                password,
            });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();

        expect(response.body.user).toMatchObject({
            id: expect.any(String),
            name: "João Silva",
            email: "joao@email.com",
            role: "USER",
        });

        expect(response.body.user).not.toHaveProperty("password");
    });

    it("deve retornar 401 quando a senha estiver incorreta", async () => {
        await prisma.user.create({
            data: {
                name: "João Silva",
                email: "joao@email.com",
                password: await hash("12345678", 12),
            },
        });

        const response = await request(app)
            .post("/auth/login")
            .send({
                email: "joao@email.com",
                password: "senha-errada",
            });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            message: "E-mail ou senha incorretos.",
        });
    });

    it("deve retornar 401 quando o e-mail não estiver cadastrado", async () => {
        const response = await request(app)
            .post("/auth/login")
            .send({
                email: "inexistente@email.com",
                password: "12345678",
            });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            message: "E-mail ou senha incorretos.",
        });
    });
});