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
import { setSocketServer } from "../../src/realtime/room-events.js";
import { RoundExpirationWorker } from "../../src/rounds/round-expiration.worker.js";
import { RoundService } from "../../src/rounds/round.service.js";

const password = "12345678";
const hostEmail = "room.finish.host@email.com";
const otherEmail = "room.finish.other@email.com";

type RecordedSocketEvent = {
    channel: string;
    event: string;
    payload: Record<string, unknown>;
};

async function cleanTestData(): Promise<void> {
    const users = await prisma.user.findMany({
        where: { email: { in: [hostEmail, otherEmail] } },
        select: { id: true },
    });

    if (users.length > 0) {
        await prisma.room.deleteMany({
            where: { hostId: { in: users.map((u) => u.id) } },
        });
    }

    await prisma.user.deleteMany({
        where: { email: { in: [hostEmail, otherEmail] } },
    });
}

async function createRoomWithPlayersAndQuestions() {
    await prisma.user.createMany({
        data: [
            {
                name: "Host Finish",
                email: hostEmail,
                password: await hash(password, 10),
            },
            {
                name: "Outro Host",
                email: otherEmail,
                password: await hash(password, 10),
            },
        ],
    });

    const hostLogin = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });
    const otherLogin = await request(app)
        .post("/auth/login")
        .send({ email: otherEmail, password });

    const hostToken = hostLogin.body.token as string;
    const otherToken = otherLogin.body.token as string;

    const roomRes = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${hostToken}`)
        .send({
            name: "Sala Encerramento Antecipado",
            theme: "Arquitetura",
            maxPlayers: 10,
            questionTime: 30,
        });

    const room = roomRes.body as { id: string; code: string };

    await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
            prisma.question.create({
                data: {
                    roomId: room.id,
                    statement: `Pergunta ${index + 1}`,
                    type: "MULTIPLE_CHOICE",
                    isActive: true,
                    options: {
                        create: Array.from({ length: 4 }, (__, optIdx) => ({
                            text: `Opção ${optIdx + 1}`,
                            isCorrect: optIdx === 0,
                            position: optIdx,
                        })),
                    },
                },
            }),
        ),
    );

    const aliceJoin = await request(app)
        .post("/rooms/join")
        .send({ code: room.code, nickname: "Alice" });
    const bobJoin = await request(app)
        .post("/rooms/join")
        .send({ code: room.code, nickname: "Bob" });

    return {
        hostToken,
        otherToken,
        room,
        alice: aliceJoin.body as { player: { id: string }; sessionToken: string },
        bob: bobJoin.body as { player: { id: string }; sessionToken: string },
    };
}

describe("POST /rooms/:id/finish (Encerrar Partida Antecipadamente) - Integração", () => {
    const recordedEvents: RecordedSocketEvent[] = [];

    beforeAll(async () => {
        await cleanTestData();
        setSocketServer({
            to: (channel: string) => ({
                emit: (event: string, payload: Record<string, unknown>) => {
                    recordedEvents.push({ channel, event, payload });
                },
            }),
        } as never);
    });

    beforeEach(async () => {
        recordedEvents.length = 0;
        await cleanTestData();
    });

    afterAll(async () => {
        setSocketServer(null as never);
        await cleanTestData();
        await prisma.$disconnect();
    });

    it("1, 2 e 3. deve exigir autorização do host e rejeitar partida WAITING que ainda não começou", async () => {
        const { hostToken, otherToken, room } = await createRoomWithPlayersAndQuestions();

        const unauthRes = await request(app).post(`/rooms/${room.id}/finish`);
        expect(unauthRes.status).toBe(401);

        const forbiddenRes = await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${otherToken}`);
        expect(forbiddenRes.status).toBe(403);

        // Partida ainda em WAITING não pode ser finalizada
        const waitingRes = await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(waitingRes.status).toBe(409);

        const notFoundRes = await request(app)
            .post("/rooms/sala-inexistente/finish")
            .set("Authorization", `Bearer ${hostToken}`);
        expect(notFoundRes.status).toBe(404);
    });

    it("4, 5, 6, 7, 8 e 9. deve encerrar partida com rodada aberta, fechar a rodada, preservar pontuações, emitir eventos, bloquear novas ações e funcionar com histórico e replay", async () => {
        const { hostToken, room, alice, bob } = await createRoomWithPlayersAndQuestions();

        const startRes = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(startRes.status).toBe(200);
        const gameId = startRes.body.currentGame.id as string;

        // Abre rodada 1; apenas Alice responde (antes de encerrar)
        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(roundRes.status).toBe(201);
        const round1Id = roundRes.body.round.id as string;

        const roundDb = await prisma.round.findUniqueOrThrow({ where: { id: round1Id } });
        const correctOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: roundDb.snapshotQuestionId, isCorrect: true },
        });
        const wrongOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: roundDb.snapshotQuestionId, isCorrect: false },
        });

        const aliceAnswer = await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: correctOpt.id });
        expect(aliceAnswer.status).toBe(201);

        const aliceAfterAnswer = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: alice.player.id },
        });
        expect(aliceAfterAnswer.score).toBeGreaterThanOrEqual(100);

        recordedEvents.length = 0;

        // Host encerra partida antecipadamente enquanto rodada 1 ainda está OPEN e Bob não respondeu
        const finishRes = await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${hostToken}`);

        expect(finishRes.status).toBe(200);
        expect(finishRes.body.alreadyFinished).toBe(false);
        expect(finishRes.body.room.status).toBe("FINISHED");
        expect(finishRes.body.room.currentGame.status).toBe("FINISHED");
        expect(finishRes.body.room.currentGame.finishedAt).toBeTruthy();
        expect(finishRes.body.room.currentGame.activeRound).toBeNull();
        expect(finishRes.body.ranking).toEqual([
            {
                id: alice.player.id,
                nickname: "Alice",
                avatarId: "explorer",
                score: aliceAfterAnswer.score,
                position: 1,
            },
            {
                id: bob.player.id,
                nickname: "Bob",
                avatarId: "explorer",
                score: 0,
                position: 2,
            },
        ]);

        // Banco: Game FINISHED (não CANCELLED), Round CLOSED, scores preservados
        const persistedGame = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
        expect(persistedGame.status).toBe("FINISHED");
        expect(persistedGame.finishedAt).not.toBeNull();

        const persistedRound = await prisma.round.findUniqueOrThrow({ where: { id: round1Id } });
        expect(persistedRound.status).toBe("CLOSED");
        expect(persistedRound.closedAt).not.toBeNull();

        // Eventos emitidos na ordem correta: round:closed -> game:finished (com ranking)
        expect(recordedEvents.map((e) => e.event)).toEqual(["round:closed", "game:finished"]);
        expect(recordedEvents[0]?.channel).toBe(`room:${room.id}`);
        expect(recordedEvents[1]?.payload).toMatchObject({
            roomId: room.id,
            gameId,
            ranking: finishRes.body.ranking,
        });

        // Bloqueios pós-encerramento: respostas, novas rodadas, fechar rodada, novos jogadores
        const lateAnswerRes = await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${bob.sessionToken}`)
            .send({ optionId: wrongOpt.id });
        expect(lateAnswerRes.status).toBe(409);

        const nextRoundBlocked = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(nextRoundBlocked.status).toBe(409);

        const joinBlocked = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carlos" });
        expect(joinBlocked.status).toBe(409);

        // Chamar finish novamente é idempotente e não reemite eventos nem altera finishedAt
        recordedEvents.length = 0;
        const repeatFinish = await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(repeatFinish.status).toBe(200);
        expect(repeatFinish.body.alreadyFinished).toBe(true);
        expect(recordedEvents).toHaveLength(0);

        const persistedGameAfterRepeat = await prisma.game.findUniqueOrThrow({
            where: { id: gameId },
        });
        expect(persistedGameAfterRepeat.finishedAt?.toISOString()).toBe(
            persistedGame.finishedAt?.toISOString(),
        );

        // Worker não altera nem reabre partida finalizada
        await prisma.round.update({
            where: { id: round1Id },
            data: { expiresAt: new Date(Date.now() - 5000) },
        });
        const worker = new RoundExpirationWorker(new RoundService(), 5000);
        expect(await worker.runCycle()).toBe(0);

        // Histórico, resultados (com vencedor e ranking) e replay seguem funcionando
        const gamesHistory = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(gamesHistory.status).toBe(200);
        expect(gamesHistory.body.games).toHaveLength(1);
        expect(gamesHistory.body.games[0].status).toBe("FINISHED");
        expect(gamesHistory.body.games[0].winner.id).toBe(alice.player.id);

        const resultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${gameId}/results`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(resultsRes.status).toBe(200);
        expect(resultsRes.body.game.ranking).toHaveLength(2);

        const replayRes = await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(replayRes.status).toBe(201);
        expect(replayRes.body.status).toBe("WAITING");
    });

    it("10. deve encerrar corretamente partida entre rodadas (rodada 1 fechada, antes da rodada 2) mantendo pontuações", async () => {
        const { hostToken, room, alice, bob } = await createRoomWithPlayersAndQuestions();

        await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);

        const r1 = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        const round1Id = r1.body.round.id as string;
        const r1Db = await prisma.round.findUniqueOrThrow({ where: { id: round1Id } });
        const correctOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: r1Db.snapshotQuestionId, isCorrect: true },
        });
        const wrongOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: r1Db.snapshotQuestionId, isCorrect: false },
        });

        // Ambos respondem -> rodada 1 fecha automaticamente (ficando entre rodadas)
        await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: correctOpt.id });
        await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${bob.sessionToken}`)
            .send({ optionId: wrongOpt.id });

        recordedEvents.length = 0;

        const finishBetweenRounds = await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${hostToken}`);

        expect(finishBetweenRounds.status).toBe(200);
        expect(finishBetweenRounds.body.alreadyFinished).toBe(false);
        expect(finishBetweenRounds.body.room.status).toBe("FINISHED");
        expect(finishBetweenRounds.body.ranking[0].score).toBeGreaterThan(0);
        // Entre rodadas não havia rodada aberta, então emite apenas game:finished com ranking
        expect(recordedEvents.map((e) => e.event)).toEqual(["game:finished"]);
    });

    it("11. condição de corrida entre encerramento manual, worker de expiração e closeRound mantém consistência e evita eventos duplicados", async () => {
        const { hostToken, room, alice } = await createRoomWithPlayersAndQuestions();

        await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);

        const r1 = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        const round1Id = r1.body.round.id as string;
        const r1Db = await prisma.round.findUniqueOrThrow({ where: { id: round1Id } });
        const correctOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: r1Db.snapshotQuestionId, isCorrect: true },
        });

        await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: correctOpt.id });

        // Força expiração da rodada 1 ao mesmo tempo em que o host encerra a partida
        await prisma.round.update({
            where: { id: round1Id },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });

        recordedEvents.length = 0;
        const worker = new RoundExpirationWorker(new RoundService(), 5000);

        const [finish1, finish2, workerClosedCount, manualCloseRes] = await Promise.all([
            request(app)
                .post(`/rooms/${room.id}/finish`)
                .set("Authorization", `Bearer ${hostToken}`),
            request(app)
                .post(`/rooms/${room.id}/finish`)
                .set("Authorization", `Bearer ${hostToken}`),
            worker.runCycle(),
            request(app)
                .post(`/rounds/${round1Id}/close`)
                .set("Authorization", `Bearer ${hostToken}`),
        ]);

        expect(finish1.status).toBe(200);
        expect(finish2.status).toBe(200);
        expect([200, 409]).toContain(manualCloseRes.status);
        expect(workerClosedCount).toBeLessThanOrEqual(1);

        // Exatamente 1 game:finished e no máximo 1 round:closed emitido
        const gameFinishedEvents = recordedEvents.filter((e) => e.event === "game:finished");
        const roundClosedEvents = recordedEvents.filter((e) => e.event === "round:closed");
        expect(gameFinishedEvents).toHaveLength(1);
        expect(roundClosedEvents).toHaveLength(1);

        const aliceFinal = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: alice.player.id },
        });
        expect(aliceFinal.score).toBeGreaterThanOrEqual(100);
    });
});
