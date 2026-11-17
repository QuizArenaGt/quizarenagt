
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
const hostEmail = "round.answer.host@email.com";

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
        where: { email: hostEmail },
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

    expect(loginResponse.status).toBe(200);

    const roomResponse = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${loginResponse.body.token}`)
        .send({
            maxPlayers: 10,
            questionTime: 30,
        });

    expect(roomResponse.status).toBe(201);

    return {
        user,
        token: loginResponse.body.token,
        room: roomResponse.body,
    };
}

async function joinPlayer(
    code: string,
    nickname: string,
) {
    const response = await request(app)
        .post("/rooms/join")
        .send({
            code,
            nickname,
        });

    expect(response.status).toBe(201);

    return {
        player: response.body.player,
        sessionToken: response.body.sessionToken,
    };
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

async function createStartedRoom() {
    const context = await createRoom();

    const player = await joinPlayer(
        context.room.code,
        "Jogador 1",
    );

    await joinPlayer(
        context.room.code,
        "Jogador 2",
    );

    await createQuestions(context.room.id, 5);

    const startResponse = await request(app)
        .post(`/rooms/${context.room.id}/start`)
        .set("Authorization", `Bearer ${context.token}`);

    expect(startResponse.status).toBe(200);

    const roundResponse = await request(app)
        .post(`/rooms/${context.room.id}/rounds`)
        .set("Authorization", `Bearer ${context.token}`);

    expect(roundResponse.status).toBe(201);

    return {
        ...context,
        player: player.player,
        sessionToken: player.sessionToken,
        roundId: roundResponse.body.round.id as string,
    };
}

async function getRoundOptions(roundId: string) {
    const round = await prisma.round.findUnique({
        where: { id: roundId },
        include: {
            snapshotQuestion: {
                include: {
                    options: true,
                },
            },
        },
    });

    if (!round) {
        throw new Error("Rodada de teste não encontrada.");
    }

    return round.snapshotQuestion.options;
}

describe("POST /rounds/:id/answer - Integração", () => {
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
        const { roundId } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .send({
                optionId: randomUUID(),
            });

        expect(response.status).toBe(401);

        const answers = await prisma.roundAnswer.findMany({
            where: { roundId },
        });

        expect(answers).toHaveLength(0);
    });

    it("deve retornar 401 quando o token do participante for inválido", async () => {
        const { roundId } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", "Bearer token-invalido")
            .send({
                optionId: randomUUID(),
            });

        expect(response.status).toBe(401);
    });

    it("deve retornar 400 quando a alternativa não possuir UUID válido", async () => {
        const { roundId, sessionToken } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: "alternativa-invalida",
            });

        expect(response.status).toBe(400);

        const answers = await prisma.roundAnswer.findMany({
            where: { roundId },
        });

        expect(answers).toHaveLength(0);
    });

    it("deve retornar 404 quando a rodada não existir", async () => {
        const { sessionToken } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${randomUUID()}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: randomUUID(),
            });

        expect(response.status).toBe(404);
    });

    it("deve retornar 409 quando a rodada estiver encerrada", async () => {
        const { roundId, sessionToken } = await createStartedRoom();

        await prisma.round.update({
            where: { id: roundId },
            data: {
                status: "CLOSED",
                closedAt: new Date(),
            },
        });

        const options = await getRoundOptions(roundId);

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: options[0].id,
            });

        expect(response.status).toBe(409);

        const answers = await prisma.roundAnswer.findMany({
            where: { roundId },
        });

        expect(answers).toHaveLength(0);
    });

    it("deve retornar 409 quando a partida não estiver ativa", async () => {
        const { room, roundId, sessionToken } =
            await createStartedRoom();

        await prisma.room.update({
            where: { id: room.id },
            data: {
                status: "FINISHED",
            },
        });

        const options = await getRoundOptions(roundId);

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: options[0].id,
            });

        expect(response.status).toBe(409);
    });

    it("deve retornar 409 quando a alternativa não pertencer à pergunta da rodada", async () => {
        const { roundId, sessionToken } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: randomUUID(),
            });

        expect(response.status).toBe(409);

        const answers = await prisma.roundAnswer.findMany({
            where: { roundId },
        });

        expect(answers).toHaveLength(0);
    });

    it("deve retornar 403 quando o participante não pertencer à sala da rodada", async () => {
        const { roundId, sessionToken } = await createStartedRoom();

        const otherRoomResponse = await request(app)
            .post("/rooms")
            .set(
                "Authorization",
                `Bearer ${(await prisma.user.findUnique({
                    where: { email: hostEmail },
                })) ? (
                    await request(app)
                        .post("/auth/login")
                        .send({ email: hostEmail, password })
                ).body.token : ""}`,
            )
            .send({
                maxPlayers: 10,
                questionTime: 30,
            });

        expect(otherRoomResponse.status).toBe(201);

        const otherPlayer = await joinPlayer(
            otherRoomResponse.body.code,
            "Participante Externo",
        );

        const options = await getRoundOptions(roundId);

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${otherPlayer.sessionToken}`)
            .send({
                optionId: options[0].id,
            });

        expect(response.status).toBe(403);

        const answers = await prisma.roundAnswer.findMany({
            where: { roundId },
        });

        expect(answers).toHaveLength(0);
    });

    it("deve registrar uma resposta correta e persistir seus dados", async () => {
        const { roundId, player, sessionToken } =
            await createStartedRoom();

        const options = await getRoundOptions(roundId);
        const correctOption = options.find(
            (option) => option.isCorrect,
        );

        expect(correctOption).toBeDefined();

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: correctOption!.id,
            });

        expect(response.status).toBe(201);

        expect(response.body.answer).toMatchObject({
            roundId,
            roomPlayerId: player.id,
            optionId: correctOption!.id,
            isCorrect: true,
        });

        expect(response.body.answer.answeredAt).toBeDefined();

        const persistedAnswer = await prisma.roundAnswer.findUnique({
            where: {
                roundId_roomPlayerId: {
                    roundId,
                    roomPlayerId: player.id,
                },
            },
        });

        expect(persistedAnswer).not.toBeNull();
        expect(persistedAnswer?.optionId).toBe(correctOption!.id);
        expect(persistedAnswer?.isCorrect).toBe(true);
        expect(persistedAnswer?.answeredAt).toBeInstanceOf(Date);
    });

    it("deve registrar uma resposta incorreta com isCorrect igual a false", async () => {
        const { roundId, player, sessionToken } =
            await createStartedRoom();

        const options = await getRoundOptions(roundId);
        const incorrectOption = options.find(
            (option) => !option.isCorrect,
        );

        expect(incorrectOption).toBeDefined();

        const response = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: incorrectOption!.id,
            });

        expect(response.status).toBe(201);

        expect(response.body.answer).toMatchObject({
            roundId,
            roomPlayerId: player.id,
            optionId: incorrectOption!.id,
            isCorrect: false,
        });
    });

    it("deve retornar 409 quando o participante tentar responder novamente", async () => {
        const { roundId, player, sessionToken } =
            await createStartedRoom();

        const options = await getRoundOptions(roundId);

        const firstResponse = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: options[0].id,
            });

        expect(firstResponse.status).toBe(201);

        const secondResponse = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${sessionToken}`)
            .send({
                optionId: options[1].id,
            });

        expect(secondResponse.status).toBe(409);

        const answers = await prisma.roundAnswer.findMany({
            where: {
                roundId,
                roomPlayerId: player.id,
            },
        });

        expect(answers).toHaveLength(1);
    });
});
