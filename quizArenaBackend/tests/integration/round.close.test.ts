
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
import { setSocketServer } from "../../src/realtime/room-events.js";
import { RoundExpirationWorker } from "../../src/rounds/round-expiration.worker.js";
import { RoundService } from "../../src/rounds/round.service.js";

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

    it("deve encerrar manualmente a rodada pelo host mesmo antes do timer e com jogadores sem resposta, preservando pontos, emitindo eventos e permitindo avançar ou encerrar partida", async () => {
        const { room, token } = await createRoom();
        await createQuestions(room.id, 5);

        const aliceJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        const startResponse = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startResponse.status).toBe(200);

        const roundResponse = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(roundResponse.status).toBe(201);
        const roundId = roundResponse.body.round.id as string;

        const alice = aliceJoin.body as {
            player: { id: string; nickname: string };
            sessionToken: string;
        };
        const bob = bobJoin.body as {
            player: { id: string; nickname: string };
            sessionToken: string;
        };

        const recordedEvents: Array<{ channel: string; event: string; payload: unknown }> = [];

        setSocketServer({
            to: (channel: string) => ({
                emit: (event: string, payload: unknown) => {
                    recordedEvents.push({ channel, event, payload });
                },
            }),
        } as never);

        try {
            // Apenas Alice responde; Bob ainda não respondeu e o timer de 30s ainda está ativo.

            const roundBefore = await prisma.round.findUniqueOrThrow({
                where: { id: roundId },
                include: {
                    snapshotQuestion: {
                        include: { options: { orderBy: { position: "asc" } } },
                    },
                },
            });
            const correctOption = roundBefore.snapshotQuestion.options.find((o) => o.isCorrect)!;
            const wrongOption = roundBefore.snapshotQuestion.options.find((o) => !o.isCorrect)!;

            const aliceAns = await request(app)
                .post(`/rounds/${roundId}/answer`)
                .set("Authorization", `Bearer ${alice.sessionToken}`)
                .send({ optionId: correctOption.id });
            expect(aliceAns.status).toBe(201);

            const aliceScoreAfterAnswer = (
                await prisma.gamePlayer.findUniqueOrThrow({ where: { id: alice.player.id } })
            ).score;
            expect(aliceScoreAfterAnswer).toBeGreaterThanOrEqual(100);

            // Verificação automática sem host ainda recusa fechar antes do tempo/respostas
            const roundService = new RoundService();
            await expect(roundService.tryCloseRoundIfReady(roundId)).resolves.toBeNull();

            recordedEvents.length = 0;

            // Host clica em "Encerrar Rodada" antes do fim do timer
            const [manualRes, duplicateManualRes] = await Promise.all([
                request(app)
                    .post(`/rounds/${roundId}/close`)
                    .set("Authorization", `Bearer ${token}`),
                request(app)
                    .post(`/rounds/${roundId}/close`)
                    .set("Authorization", `Bearer ${token}`),
            ]);

            expect(manualRes.status).toBe(200);
            expect(duplicateManualRes.status).toBe(200);
            expect(manualRes.body.round.status).toBe("CLOSED");
            expect(manualRes.body.round.answers).toHaveLength(1);
            expect(manualRes.body.round.unansweredPlayers).toEqual([
                { id: bob.player.id, nickname: "Bob", avatarId: "explorer" },
            ]);
            expect(manualRes.body.round.ranking).toEqual([
                { id: alice.player.id, nickname: "Alice", avatarId: "explorer", score: aliceScoreAfterAnswer },
                { id: bob.player.id, nickname: "Bob", avatarId: "explorer", score: 0 },
            ]);

            // Evento round:closed emitido exatamente uma vez
            const closedEvents = recordedEvents.filter((e) => e.event === "round:closed");
            expect(closedEvents).toHaveLength(1);
            expect(closedEvents[0]?.channel).toBe(`room:${room.id}`);

            // Worker rodando após expiração simulada não reabre nem duplica pontuação
            await prisma.round.update({
                where: { id: roundId },
                data: { expiresAt: new Date(Date.now() - 1000) },
            });
            const worker = new RoundExpirationWorker(new RoundService(), 5000);
            expect(await worker.runCycle()).toBe(0);

            // Resposta tardia após encerramento manual é rejeitada (409)
            const lateBobAns = await request(app)
                .post(`/rounds/${roundId}/answer`)
                .set("Authorization", `Bearer ${bob.sessionToken}`)
                .send({ optionId: wrongOption.id });
            expect(lateBobAns.status).toBe(409);

            // Pontuações preservadas
            expect(
                (await prisma.gamePlayer.findUniqueOrThrow({ where: { id: alice.player.id } })).score,
            ).toBe(aliceScoreAfterAnswer);
            expect(
                (await prisma.gamePlayer.findUniqueOrThrow({ where: { id: bob.player.id } })).score,
            ).toBe(0);

            // Continuidade: host pode abrir a próxima rodada ou encerrar partida
            const nextRoundRes = await request(app)
                .post(`/rooms/${room.id}/rounds`)
                .set("Authorization", `Bearer ${token}`);
            expect(nextRoundRes.status).toBe(201);
            expect(nextRoundRes.body.round.roundNumber).toBe(2);

            const finishRes = await request(app)
                .post(`/rooms/${room.id}/finish`)
                .set("Authorization", `Bearer ${token}`);
            expect(finishRes.status).toBe(200);
            expect(finishRes.body.room.status).toBe("FINISHED");
        } finally {
            setSocketServer(null as never);
        }
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
