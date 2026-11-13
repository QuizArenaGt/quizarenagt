import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";

const password = "12345678";

const testEmails = [
    "room.host@email.com",
    "room.attacker@email.com",
];

async function cleanTestData(): Promise<void> {
    const users = await prisma.user.findMany({
        where: {
            email: {
                in: testEmails,
            },
        },
        select: {
            id: true,
        },
    });

    const userIds = users.map((user) => user.id);

    if (userIds.length > 0) {
        await prisma.room.deleteMany({
            where: {
                hostId: {
                    in: userIds,
                },
            },
        });
    }

    await prisma.user.deleteMany({
        where: {
            email: {
                in: testEmails,
            },
        },
    });
}

async function createUserAndToken(email: string) {
    const user = await prisma.user.create({
        data: {
            name: "Usuário de Teste",
            email,
            password: await hash(password, 12),
        },
    });

    const loginResponse = await request(app)
        .post("/auth/login")
        .send({
            email,
            password,
        });

    return {
        user,
        token: loginResponse.body.token as string,
    };
}

describe("POST /rooms - Integração", () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    beforeEach(async () => {
        await cleanTestData();
    });

    afterAll(async () => {
        await cleanTestData();
        await prisma.$disconnect();
    });

    it("deve criar uma sala e persistir os dados no PostgreSQL", async () => {
        const { user, token } = await createUserAndToken(
            "room.host@email.com",
        );

        const response = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 10,
                questionTime: 30,
            });

        expect(response.status).toBe(201);

        expect(response.body).toMatchObject({
            hostId: user.id,
            maxPlayers: 10,
            questionTime: 30,
            gameMode: "CLASSIC",
            status: "WAITING",
        });

        expect(response.body.id).toBeDefined();
        expect(response.body.code).toMatch(/^[A-Z0-9]{6}$/);
        expect(response.body.createdAt).toBeDefined();

        const room = await prisma.room.findUnique({
            where: {
                id: response.body.id,
            },
        });

        expect(room).not.toBeNull();
        expect(room?.hostId).toBe(user.id);
        expect(room?.code).toBe(response.body.code);
        expect(room?.maxPlayers).toBe(10);
        expect(room?.questionTime).toBe(30);
        expect(room?.gameMode).toBe("CLASSIC");
        expect(room?.status).toBe("WAITING");
    });

    it("deve criar uma sala no modo HARDCORE", async () => {
        const { token } = await createUserAndToken(
            "room.host@email.com",
        );

        const response = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "HARDCORE",
            });

        expect(response.status).toBe(201);
        expect(response.body.gameMode).toBe("HARDCORE");
    });

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app)
            .post("/rooms")
            .send({
                maxPlayers: 10,
                questionTime: 30,
            });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message");
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        const response = await request(app)
            .post("/rooms")
            .set("Authorization", "Bearer token-invalido")
            .send({
                maxPlayers: 10,
                questionTime: 30,
            });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message");
    });

    it("deve retornar 400 quando as configurações forem inválidas", async () => {
        const { token } = await createUserAndToken(
            "room.host@email.com",
        );

        const response = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 1,
                questionTime: 30,
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body).toHaveProperty("errors");

        const rooms = await prisma.room.findMany();

        expect(rooms).toHaveLength(0);
    });

    it("não deve permitir que o cliente defina outro hostId", async () => {
        const { user, token } = await createUserAndToken(
            "room.host@email.com",
        );

        const attacker = await prisma.user.create({
            data: {
                name: "Outro Usuário",
                email: "room.attacker@email.com",
                password: await hash(password, 12),
            },
        });

        const response = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 10,
                questionTime: 30,
                hostId: attacker.id,
            });

        expect(response.status).toBe(201);
        expect(response.body.hostId).toBe(user.id);
        expect(response.body.hostId).not.toBe(attacker.id);

        const room = await prisma.room.findUnique({
            where: {
                id: response.body.id,
            },
        });

        expect(room?.hostId).toBe(user.id);
    });
});
