import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { compare } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { UserRepository } from "../../src/users/user.repository.js";

describe("POST /auth/register - Integração", () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany();
    });

    afterAll(async () => {
        await prisma.user.deleteMany();
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
});