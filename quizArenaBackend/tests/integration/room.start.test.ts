
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";

const password = "12345678";
const hostEmail = "room.start.host@email.com";
const otherEmail = "room.start.other@email.com";

async function cleanTestData(): Promise<void> {
    const host = await prisma.user.findUnique({
        where: { email: hostEmail },
        select: { id: true },
    });

    if (host) {
        await prisma.room.deleteMany({
            where: { hostId: host.id },
        });
    }

    await prisma.user.deleteMany({
        where: {
            email: {
                in: [hostEmail, otherEmail],
            },
        },
    });
}

async function createRoom() {
    const user = await prisma.user.create({
        data: {
            name: "Host de Teste",
            email: hostEmail,
            password: await hash(password, 12),
        },
    });

    const loginResponse = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });

    const roomResponse = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${loginResponse.body.token}`)
        .send({
            maxPlayers: 10,
            questionTime: 30,
        });

    return {
        user,
        token: loginResponse.body.token,
        room: roomResponse.body,
    };
}

async function createOtherUser(): Promise<string> {
    await prisma.user.create({
        data: {
            name: "Outro Usuário",
            email: otherEmail,
            password: await hash(password, 12),
        },
    });

    const response = await request(app)
        .post("/auth/login")
        .send({ email: otherEmail, password });

    return response.body.token;
}

async function createPlayers(roomId: string, quantity: number): Promise<void> {
    await prisma.roomPlayer.createMany({
        data: Array.from({ length: quantity }, (_, index) => ({
            roomId,
            nickname: `Jogador ${index + 1}`,
        })),
    });
}

async function createQuestions(
    roomId: string,
    quantity: number,
    isActive = true,
): Promise<void> {
    await prisma.question.createMany({
        data: Array.from({ length: quantity }, (_, index) => ({
            roomId,
            statement: `Pergunta de teste ${index + 1}`,
            type: "TRUE_FALSE",
            isActive,
        })),
    });
}

describe("POST /rooms/:id/start - Integração", () => {
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

    it("deve retornar 401 quando não houver autenticação", async () => {
        const { room } = await createRoom();

        const response = await request(app)
            .post(`/rooms/${room.id}/start`);

        expect(response.status).toBe(401);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("WAITING");
    });

    it("deve iniciar a partida quando todos os requisitos forem atendidos", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, 5);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("IN_PROGRESS");

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("IN_PROGRESS");
    });

    it("não deve permitir que outro usuário inicie a partida", async () => {
        const { room } = await createRoom();
        const otherToken = await createOtherUser();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, 5);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${otherToken}`);

        expect(response.status).toBe(403);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("WAITING");
    });

    it("não deve iniciar com menos de 2 jogadores", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 1);
        await createQuestions(room.id, 5);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("WAITING");
    });

    it("não deve iniciar com menos de 5 perguntas ativas", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, 4);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("WAITING");
    });

    it("não deve considerar perguntas inativas na contagem", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, 4);
        await createQuestions(room.id, 1, false);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("WAITING");
    });

    it("não deve iniciar uma sala que já foi iniciada", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, 5);

        await prisma.room.update({
            where: { id: room.id },
            data: { status: "IN_PROGRESS" },
        });

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const { token } = await createRoom();

        const response = await request(app)
            .post(`/rooms/${randomUUID()}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });

    it("deve permitir apenas uma inicialização em chamadas simultâneas", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, 5);

        const startRequests = Array.from({ length: 2 }, () =>
            request(app)
                .post(`/rooms/${room.id}/start`)
                .set("Authorization", `Bearer ${token}`),
        );

        const responses = await Promise.all(startRequests);

        const successfulResponses = responses.filter(
            (response) => response.status === 200,
        );

        const rejectedResponses = responses.filter(
            (response) => response.status === 409,
        );

        expect(successfulResponses).toHaveLength(1);
        expect(rejectedResponses).toHaveLength(1);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("IN_PROGRESS");
    });
});
