
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { validRoomQuestions } from "../helpers/room-test-data.js";

const password = "12345678";
const hostEmail = "room.join.host@email.com";

async function cleanTestData(): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { email: hostEmail },
        select: { id: true },
    });

    if (user) {
        await prisma.room.deleteMany({
            where: { hostId: user.id },
        });
    }

    await prisma.user.deleteMany({
        where: { email: hostEmail },
    });
}

async function createRoom(maxPlayers = 10) {
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
            maxPlayers,
            questionTime: 30,
            questions: validRoomQuestions(),
        });

    return {
        user,
        room: roomResponse.body,
    };
}

describe("POST /rooms/join - Integração", () => {
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


    it("deve permitir que um jogador entre sem autenticação e persistir seus dados", async () => {
        const { room } = await createRoom();

        const response = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 1",
            });

        expect(response.status).toBe(201);

        expect(response.body.player).toMatchObject({
            roomId: room.id,
            nickname: "Jogador 1",
            score: 0,
        });

        expect(response.body.player.id).toBeDefined();
        expect(response.body.player.joinedAt).toBeDefined();
        expect(response.body.sessionToken).toBeDefined();
        expect(response.body.sessionToken).toEqual(expect.any(String));

        expect(response.body.player.sessionTokenHash).toBeUndefined();

        const player = await prisma.roomPlayer.findUnique({
            where: {
                id: response.body.player.id,
            },
        });

        expect(player).not.toBeNull();
        expect(player?.roomId).toBe(room.id);
        expect(player?.nickname).toBe("Jogador 1");
        expect(player?.sessionTokenHash).toBeDefined();
        expect(player?.sessionTokenHash).not.toBe(response.body.sessionToken);
    });


    it("não deve permitir dois jogadores com o mesmo nickname na sala", async () => {
        const { room } = await createRoom();

        const firstResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 1",
            });

        expect(firstResponse.status).toBe(201);

        const secondResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 1",
            });

        expect(secondResponse.status).toBe(409);
        expect(secondResponse.body).toHaveProperty("message");

        const players = await prisma.roomPlayer.findMany({
            where: { roomId: room.id },
        });

        expect(players).toHaveLength(1);
    });


    it("deve retornar 404 quando o código da sala não existir", async () => {
        const response = await request(app)
            .post("/rooms/join")
            .send({
                code: "ABC123",
                nickname: "Jogador 1",
            });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty(
            "message",
            "Sala não encontrada.",
        );
    });


    it("não deve permitir entrada em uma sala que já iniciou", async () => {
        const { room } = await createRoom();

        await prisma.room.update({
            where: { id: room.id },
            data: { status: "IN_PROGRESS" },
        });

        const response = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 1",
            });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty(
            "message",
            "Esta sala não está aceitando novos jogadores.",
        );

        const players = await prisma.roomPlayer.findMany({
            where: { roomId: room.id },
        });

        expect(players).toHaveLength(0);
    });



    it("não deve permitir entrada quando a sala estiver cheia", async () => {
        const { room } = await createRoom(2);

        const firstResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 1",
            });

        const secondResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 2",
            });

        expect(firstResponse.status).toBe(201);
        expect(secondResponse.status).toBe(201);

        const thirdResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador 3",
            });

        expect(thirdResponse.status).toBe(409);
        expect(thirdResponse.body).toHaveProperty(
            "message",
            "Esta sala atingiu o limite de jogadores.",
        );

        const players = await prisma.roomPlayer.findMany({
            where: { roomId: room.id },
        });

        expect(players).toHaveLength(2);
    });

    it("não deve ultrapassar o limite de jogadores com entradas simultâneas", async () => {
        const { room } = await createRoom(2);

        const attempts = Array.from({ length: 8 }, (_, index) =>
            request(app)
                .post("/rooms/join")
                .send({
                    code: room.code,
                    nickname: `Concorrente ${index + 1}`,
                }),
        );

        const responses = await Promise.all(attempts);

        const successfulResponses = responses.filter(
            (response) => response.status === 201,
        );

        const rejectedResponses = responses.filter(
            (response) => response.status === 409,
        );

        expect(successfulResponses).toHaveLength(2);
        expect(rejectedResponses).toHaveLength(6);

        const players = await prisma.roomPlayer.findMany({
            where: { roomId: room.id },
        });

        expect(players).toHaveLength(2);
    });


    it("deve retornar 400 quando o código da sala for inválido", async () => {
        const { room } = await createRoom();

        const response = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code.slice(0, 5),
                nickname: "Jogador 1",
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("code");

        const players = await prisma.roomPlayer.findMany({
            where: { roomId: room.id },
        });

        expect(players).toHaveLength(0);
    });

    it.each([
        {
            nickname: "J",
            description: "nickname com menos de 2 caracteres",
        },
        {
            nickname: "Jogador12345678901234",
            description: "nickname com mais de 20 caracteres",
        },
    ])("deve retornar 400 para $description", async ({ nickname }) => {
        const { room } = await createRoom();

        const response = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname,
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("nickname");

        const players = await prisma.roomPlayer.findMany({
            where: { roomId: room.id },
        });

        expect(players).toHaveLength(0);
    });


});
