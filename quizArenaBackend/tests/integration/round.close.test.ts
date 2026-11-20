
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
const hostEmail = "round.close.host@email.com";
const otherEmail = "round.close.other@email.com";

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

    await createQuestions(context.room.id, 5);

    const initialGame = await prisma.game.findFirstOrThrow({
        where: { roomId: context.room.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    await prisma.gamePlayer.createMany({
        data: [
            { gameId: initialGame.id, nickname: "Jogador 1" },
            { gameId: initialGame.id, nickname: "Jogador 2" },
        ],
    });

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
        roundId: roundResponse.body.round.id as string,
    };
}

async function submitAnswersDirectly(
    roundId: string,
    roomId: string,
): Promise<void> {
    const [round, players] = await Promise.all([
        prisma.round.findUniqueOrThrow({
            where: { id: roundId },
            include: {
                snapshotQuestion: {
                    include: {
                        options: {
                            orderBy: { position: "asc" },
                        },
                    },
                },
            },
        }),
        prisma.gamePlayer.findMany({
            where: { game: { roomId } },
        }),
    ]);

    const correctOption = round.snapshotQuestion.options.find(
        (option) => option.isCorrect,
    );

    if (!correctOption) {
        throw new Error("Alternativa correta não encontrada no snapshot.");
    }

    for (const player of players) {
        await prisma.roundAnswer.create({
            data: {
                roundId,
                gamePlayerId: player.id,
                optionId: correctOption.id,
                answeredAt: new Date(),
                isCorrect: true,
                points: 120,
            },
        });

        await prisma.gamePlayer.update({
            where: { id: player.id },
            data: {
                score: { increment: 120 },
            },
        });
    }
}

describe("POST /rounds/:id/close - Integração", () => {
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

    it("deve retornar 401 sem autenticação", async () => {
        const { roundId } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${roundId}/close`);

        expect(response.status).toBe(401);
    });

    it("deve encerrar a rodada quando todos os jogadores responderem", async () => {
        const { room, roundId, token } = await createStartedRoom();

        await submitAnswersDirectly(roundId, room.id);

        const response = await request(app)
            .post(`/rounds/${roundId}/close`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.round).toMatchObject({
            id: roundId,
            status: "CLOSED",
            roundNumber: 1,
        });

        expect(response.body.round.closedAt).toBeDefined();
        expect(response.body.round.question.options).toHaveLength(4);
        expect(response.body.round.answers).toHaveLength(2);
        expect(response.body.round.unansweredPlayers).toHaveLength(0);
        expect(response.body.round.ranking).toHaveLength(2);

        expect(
            response.body.round.answers.every(
                (answer: { isCorrect: boolean; points: number }) =>
                    answer.isCorrect && answer.points === 120,
            ),
        ).toBe(true);

        const playersBeforeRetry = await prisma.gamePlayer.findMany({
            where: { game: { roomId: room.id } },
            orderBy: { nickname: "asc" },
        });

        const retryResponse = await request(app)
            .post(`/rounds/${roundId}/close`)
            .set("Authorization", `Bearer ${token}`);

        expect(retryResponse.status).toBe(200);

        const playersAfterRetry = await prisma.gamePlayer.findMany({
            where: { game: { roomId: room.id } },
            orderBy: { nickname: "asc" },
        });

        expect(playersAfterRetry.map((player) => player.score)).toEqual(
            playersBeforeRetry.map((player) => player.score),
        );
    });

    it("deve encerrar a rodada quando o tempo acabar", async () => {
        const { room, roundId, token } = await createStartedRoom();

        await prisma.round.update({
            where: { id: roundId },
            data: {
                openedAt: new Date(Date.now() - 31_000),
                expiresAt: new Date(Date.now() - 1_000),
            },
        });

        const response = await request(app)
            .post(`/rounds/${roundId}/close`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.round.status).toBe("CLOSED");
        expect(response.body.round.unansweredPlayers).toHaveLength(2);
        expect(response.body.round.answers).toHaveLength(0);
    });

    it("não deve encerrar uma rodada antes do tempo e sem todas as respostas", async () => {
        const { roundId, token } = await createStartedRoom();

        const response = await request(app)
            .post(`/rounds/${roundId}/close`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);

        const round = await prisma.round.findUnique({
            where: { id: roundId },
        });

        expect(round?.status).toBe("OPEN");
        expect(round?.closedAt).toBeNull();
    });

    it("não deve permitir que outro usuário encerre a rodada", async () => {
        const { roundId } = await createStartedRoom();
        const otherToken = await createOtherUser();

        await submitAnswersDirectly(
            roundId,
            (await prisma.round.findUniqueOrThrow({
                where: { id: roundId },
                include: { game: true },
            })).game.roomId,
        );

        const response = await request(app)
            .post(`/rounds/${roundId}/close`)
            .set("Authorization", `Bearer ${otherToken}`);

        expect(response.status).toBe(403);

        const round = await prisma.round.findUnique({
            where: { id: roundId },
        });

        expect(round?.status).toBe("OPEN");
    });

    it("deve retornar 404 quando a rodada não existir", async () => {
        const { token } = await createRoom();

        const response = await request(app)
            .post(`/rounds/${randomUUID()}/close`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });
});
