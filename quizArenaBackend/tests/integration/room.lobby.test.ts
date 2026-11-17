
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

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";

const password = "12345678";
const hostEmail = "room.lobby.host@email.com";
const outsiderEmail = "room.lobby.outsider@email.com";

async function cleanTestData(): Promise<void> {
    const emails = [hostEmail, outsiderEmail];

    const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
    });

    const userIds = users.map((user) => user.id);

    if (userIds.length > 0) {
        await prisma.room.deleteMany({
            where: { hostId: { in: userIds } },
        });

        await prisma.user.deleteMany({
            where: { id: { in: userIds } },
        });
    }
}

async function createHostAndRoom(maxPlayers = 10) {
    const user = await prisma.user.create({
        data: {
            name: "Host do Lobby",
            email: hostEmail,
            password: await hash(password, 12),
        },
    });

    const loginResponse = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });

    expect(loginResponse.status).toBe(200);

    const token = loginResponse.body.token;

    const roomResponse = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
            maxPlayers,
            questionTime: 30,
        });

    expect(roomResponse.status).toBe(201);

    return {
        user,
        token,
        room: roomResponse.body,
    };
}

describe("GET /rooms/:code - Integração", () => {
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

    it("deve permitir que o host consulte o lobby usando JWT", async () => {
        const { user, token, room } = await createHostAndRoom();

        const response = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);

        expect(response.body.room).toMatchObject({
            id: room.id,
            code: room.code,
            status: "WAITING",
            gameMode: "CLASSIC",
            maxPlayers: 10,
            questionTime: 30,
            host: {
                id: user.id,
                name: "Host do Lobby",
            },
            players: [],
            playerCount: 0,
        });
    });

    it("deve permitir que um jogador consulte o lobby usando seu token de sessão", async () => {
        const { room } = await createHostAndRoom();

        const joinResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador Lobby",
            });

        expect(joinResponse.status).toBe(201);

        const sessionToken = joinResponse.body.sessionToken;

        const response = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${sessionToken}`);

        expect(response.status).toBe(200);

        expect(response.body.room).toMatchObject({
            id: room.id,
            code: room.code,
            playerCount: 1,
            players: [
                {
                    id: joinResponse.body.player.id,
                    nickname: "Jogador Lobby",
                    score: 0,
                },
            ],
        });
    });

    it("não deve permitir que um jogador consulte outra sala", async () => {
        const { room: firstRoom } = await createHostAndRoom();

        const secondRoomResponse = await request(app)
            .post("/rooms")
            .set(
                "Authorization",
                `Bearer ${
                    (
                        await request(app)
                            .post("/auth/login")
                            .send({
                                email: hostEmail,
                                password,
                            })
                    ).body.token
                }`,
            )
            .send({
                maxPlayers: 10,
                questionTime: 30,
            });

        expect(secondRoomResponse.status).toBe(201);

        const joinResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: secondRoomResponse.body.code,
                nickname: "Jogador Outra Sala",
            });

        expect(joinResponse.status).toBe(201);

        const response = await request(app)
            .get(`/rooms/${firstRoom.code}`)
            .set(
                "Authorization",
                `Bearer ${joinResponse.body.sessionToken}`,
            );

        expect(response.status).toBe(403);
    });

    it("não deve permitir que outro usuário autenticado consulte o lobby", async () => {
        const { room } = await createHostAndRoom();

        await prisma.user.create({
            data: {
                name: "Usuário Externo",
                email: outsiderEmail,
                password: await hash(password, 12),
            },
        });

        const loginResponse = await request(app)
            .post("/auth/login")
            .send({
                email: outsiderEmail,
                password,
            });

        expect(loginResponse.status).toBe(200);

        const response = await request(app)
            .get(`/rooms/${room.code}`)
            .set(
                "Authorization",
                `Bearer ${loginResponse.body.token}`,
            );

        expect(response.status).toBe(403);
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        const { room } = await createHostAndRoom();

        const response = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", "Bearer token-invalido");

        expect(response.status).toBe(401);
    });

    it("deve retornar 401 quando não houver credencial", async () => {
        const { room } = await createHostAndRoom();

        const response = await request(app)
            .get(`/rooms/${room.code}`);

        expect(response.status).toBe(401);
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const { token } = await createHostAndRoom();

        const response = await request(app)
            .get("/rooms/ZZZ999")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });

    it("deve retornar 400 quando o código da sala for inválido", async () => {
        const { token } = await createHostAndRoom();

        const response = await request(app)
            .get("/rooms/ABC")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(400);
    });

    it("não deve expor dados privados do host ou dos jogadores", async () => {
        const { token, room } = await createHostAndRoom();

        const joinResponse = await request(app)
            .post("/rooms/join")
            .send({
                code: room.code,
                nickname: "Jogador Seguro",
            });

        expect(joinResponse.status).toBe(201);

        const response = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);

        const serializedResponse = JSON.stringify(response.body);

        expect(serializedResponse).not.toContain("password");
        expect(serializedResponse).not.toContain("sessionTokenHash");
        expect(serializedResponse).not.toContain(outsiderEmail);

        expect(response.body.room.host).not.toHaveProperty("email");
        expect(response.body.room.players[0]).not.toHaveProperty(
            "sessionTokenHash",
        );
    });
});
