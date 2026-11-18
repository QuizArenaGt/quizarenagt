
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";
import { RoomStatus } from "@prisma/client";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";

const password = "12345678";

const testEmails = [
    "room.update.host@email.com",
    "room.update.attacker@email.com",
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

describe("PATCH /rooms/:id - Integração", () => {
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

    async function createRoom(hostId: string) {
        return prisma.room.create({
            data: {
                code: `UPD${Date.now().toString().slice(-3)}${Math.floor(Math.random() * 1000)}`,
                hostId,
                maxPlayers: 10,
                questionTime: 30,
            },
        });
    }

    it("deve atualizar as configurações da sala e persistir no PostgreSQL", async () => {
        const { user, token } = await createUserAndToken(
            "room.update.host@email.com",
        );

        const room = await createRoom(user.id);

        const response = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 20,
                questionTime: 60,
                gameMode: "HARDCORE",
            });

        expect(response.status).toBe(200);

        expect(response.body).toMatchObject({
            id: room.id,
            hostId: user.id,
            maxPlayers: 20,
            questionTime: 60,
            gameMode: "HARDCORE",
            status: "WAITING",
        });

        const updatedRoom = await prisma.room.findUnique({
            where: {
                id: room.id,
            },
        });

        expect(updatedRoom).not.toBeNull();
        expect(updatedRoom?.maxPlayers).toBe(20);
        expect(updatedRoom?.questionTime).toBe(60);
        expect(updatedRoom?.gameMode).toBe("HARDCORE");
    });

    it("deve atualizar somente os campos informados", async () => {
        const { user, token } = await createUserAndToken(
            "room.update.host@email.com",
        );

        const room = await createRoom(user.id);

        const response = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 25,
            });

        expect(response.status).toBe(200);
        expect(response.body.maxPlayers).toBe(25);
        expect(response.body.questionTime).toBe(30);
        expect(response.body.gameMode).toBe("CLASSIC");
    });

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app)
            .patch("/rooms/room-test-uuid")
            .send({
                maxPlayers: 20,
            });

        expect(response.status).toBe(401);
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        const response = await request(app)
            .patch("/rooms/room-test-uuid")
            .set("Authorization", "Bearer token-invalido")
            .send({
                maxPlayers: 20,
            });

        expect(response.status).toBe(401);
    });

    it("deve retornar 400 quando as configurações forem inválidas", async () => {
        const { user, token } = await createUserAndToken(
            "room.update.host@email.com",
        );

        const room = await createRoom(user.id);

        const response = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 1,
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body).toHaveProperty("errors");

        const unchangedRoom = await prisma.room.findUnique({
            where: {
                id: room.id,
            },
        });

        expect(unchangedRoom?.maxPlayers).toBe(10);
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const { token } = await createUserAndToken(
            "room.update.host@email.com",
        );

        const response = await request(app)
            .patch("/rooms/00000000-0000-4000-8000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 20,
            });

        expect(response.status).toBe(404);
    });

    it("deve retornar 403 quando o usuário não for o host da sala", async () => {
        const { user } = await createUserAndToken(
            "room.update.host@email.com",
        );

        const { token } = await createUserAndToken(
            "room.update.attacker@email.com",
        );

        const room = await createRoom(user.id);

        const response = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 20,
            });

        expect(response.status).toBe(403);

        const unchangedRoom = await prisma.room.findUnique({
            where: {
                id: room.id,
            },
        });

        expect(unchangedRoom?.maxPlayers).toBe(10);
    });

    it("deve retornar 409 quando a sala já estiver em andamento", async () => {
        const { user, token } = await createUserAndToken(
            "room.update.host@email.com",
        );

        const room = await createRoom(user.id);

        await prisma.room.update({
            where: {
                id: room.id,
            },
            data: {
                status: RoomStatus.IN_PROGRESS,
            },
        });

        const response = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 20,
            });

        expect(response.status).toBe(409);

        const unchangedRoom = await prisma.room.findUnique({
            where: {
                id: room.id,
            },
        });

        expect(unchangedRoom?.maxPlayers).toBe(10);
        expect(unchangedRoom?.status).toBe(RoomStatus.IN_PROGRESS);
    });
});
