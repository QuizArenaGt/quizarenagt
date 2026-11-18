
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
const hostEmail = "round.create-next.host@email.com";
const otherEmail = "round.create-next.other@email.com";

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

async function createPlayers(roomId: string): Promise<void> {
    await prisma.roomPlayer.createMany({
        data: [
            { roomId, nickname: "Jogador 1" },
            { roomId, nickname: "Jogador 2" },
        ],
    });
}

async function createQuestions(
    roomId: string,
    quantity: number,
): Promise<void> {
    await Promise.all(
        Array.from({ length: quantity }, (_, index) =>
            prisma.question.create({
                data: {
                    roomId,
                    statement: `Pergunta de teste ${index + 1}`,
                    type: "MULTIPLE_CHOICE",
                    isActive: true,
                    options: {
                        create: Array.from(
                            { length: 4 },
                            (_, optionIndex) => ({
                                text: `Alternativa ${optionIndex + 1}`,
                                isCorrect: optionIndex === 0,
                                position: optionIndex,
                            }),
                        ),
                    },
                },
            }),
        ),
    );
}

async function startRoom(
    roomId: string,
    token: string,
): Promise<void> {
    const response = await request(app)
        .post(`/rooms/${roomId}/start`)
        .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
}

async function createStartedRoom() {
    const context = await createRoom();

    await createQuestions(context.room.id, 5);
    await createPlayers(context.room.id);

    await startRoom(context.room.id, context.token);

    return context;
}

describe("POST /rooms/:id/rounds - Integração", () => {
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
        const { room } = await createStartedRoom();

        const response = await request(app)
            .post(`/rooms/${room.id}/rounds`);

        expect(response.status).toBe(401);

        const rounds = await prisma.round.findMany({
            where: {
                game: {
                    roomId: room.id,
                },
            },
        });

        expect(rounds).toHaveLength(0);
    });

    it("deve criar a primeira rodada utilizando a primeira pergunta do snapshot", async () => {
        const { room, token } = await createStartedRoom();

        const snapshot = await prisma.roomQuestionSnapshot.findUnique({
            where: { roomId: room.id },
            include: {
                questions: {
                    orderBy: { position: "asc" },
                    include: {
                        options: {
                            orderBy: { position: "asc" },
                        },
                    },
                },
            },
        });

        const firstQuestion = snapshot!.questions[0];

        const response = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(201);
        expect(response.body.finished).toBe(false);

        expect(response.body.round).toMatchObject({
            roundNumber: 1,
            status: "OPEN",
            timeLimit: 30,
            question: {
                id: firstQuestion.id,
                statement: firstQuestion.statement,
                position: 0,
            },
        });

        expect(response.body.round.openedAt).toBeDefined();

        expect(response.body.round.question.options).toHaveLength(4);

        for (const option of response.body.round.question.options) {
            expect(option).not.toHaveProperty("isCorrect");
            expect(option).not.toHaveProperty("sourceOptionId");
        }

        const persistedRound = await prisma.round.findUnique({
            where: { id: response.body.round.id },
        });

        expect(persistedRound).not.toBeNull();
        expect(persistedRound?.status).toBe("OPEN");
        expect(persistedRound?.roundNumber).toBe(1);
        expect(persistedRound?.snapshotQuestionId).toBe(firstQuestion.id);
        expect(persistedRound?.timeLimit).toBe(30);
        expect(persistedRound?.openedAt).toBeInstanceOf(Date);
    });

    it("deve criar a próxima rodada após o encerramento da anterior", async () => {
        const { room, token } = await createStartedRoom();

        const firstResponse = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(firstResponse.status).toBe(201);

        await prisma.round.update({
            where: { id: firstResponse.body.round.id },
            data: {
                status: "CLOSED",
                closedAt: new Date(),
            },
        });

        const response = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(201);
        expect(response.body.finished).toBe(false);
        expect(response.body.round.roundNumber).toBe(2);
        expect(response.body.round.question.position).toBe(1);

        const persistedRounds = await prisma.round.findMany({
            where: {
                game: {
                    roomId: room.id,
                },
            },
            orderBy: {
                roundNumber: "asc",
            },
        });

        expect(persistedRounds).toHaveLength(2);
        expect(persistedRounds[0].status).toBe("CLOSED");
        expect(persistedRounds[1].status).toBe("OPEN");
    });

    it("não deve permitir criar outra rodada enquanto existir uma aberta", async () => {
        const { room, token } = await createStartedRoom();

        const firstResponse = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(firstResponse.status).toBe(201);

        const response = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);

        const rounds = await prisma.round.findMany({
            where: {
                game: {
                    roomId: room.id,
                },
            },
        });

        expect(rounds).toHaveLength(1);
        expect(rounds[0].status).toBe("OPEN");
    });

    it("não deve permitir que outro usuário avance a rodada", async () => {
        const { room } = await createStartedRoom();
        const otherToken = await createOtherUser();

        const response = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${otherToken}`);

        expect(response.status).toBe(403);

        const rounds = await prisma.round.findMany({
            where: {
                game: {
                    roomId: room.id,
                },
            },
        });

        expect(rounds).toHaveLength(0);
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const { token } = await createRoom();

        const response = await request(app)
            .post(`/rooms/${randomUUID()}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });

    it("deve finalizar a partida quando todas as perguntas forem utilizadas", async () => {
        const { room, token } = await createStartedRoom();

        for (let index = 0; index < 5; index++) {
            const response = await request(app)
                .post(`/rooms/${room.id}/rounds`)
                .set("Authorization", `Bearer ${token}`);

            expect(response.status).toBe(201);
            expect(response.body.finished).toBe(false);
            expect(response.body.round.roundNumber).toBe(index + 1);

            await prisma.round.update({
                where: { id: response.body.round.id },
                data: {
                    status: "CLOSED",
                    closedAt: new Date(),
                },
            });
        }

        const finishResponse = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(finishResponse.status).toBe(200);
        expect(finishResponse.body.finished).toBe(true);

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("FINISHED");

        const game = await prisma.game.findUnique({
            where: { roomId: room.id },
        });

        expect(game?.finishedAt).toBeInstanceOf(Date);

        const rounds = await prisma.round.findMany({
            where: {
                game: {
                    roomId: room.id,
                },
            },
        });

        expect(rounds).toHaveLength(5);
        expect(rounds.every((round) => round.status === "CLOSED")).toBe(true);
    });

    it("deve permitir apenas uma criação de rodada em chamadas simultâneas", async () => {
        const { room, token } = await createStartedRoom();

        const requests = Array.from({ length: 2 }, () =>
            request(app)
                .post(`/rooms/${room.id}/rounds`)
                .set("Authorization", `Bearer ${token}`),
        );

        const responses = await Promise.all(requests);

        const successfulResponses = responses.filter(
            (response) => response.status === 201,
        );

        const rejectedResponses = responses.filter(
            (response) => response.status === 409,
        );

        expect(successfulResponses).toHaveLength(1);
        expect(rejectedResponses).toHaveLength(1);

        const rounds = await prisma.round.findMany({
            where: {
                game: {
                    roomId: room.id,
                },
            },
        });

        expect(rounds).toHaveLength(1);
        expect(rounds[0].status).toBe("OPEN");
    });
});
