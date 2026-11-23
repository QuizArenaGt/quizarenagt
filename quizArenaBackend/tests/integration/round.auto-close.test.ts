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
const hostEmail = "round.auto-close.host@email.com";

type RecordedSocketEvent = {
    channel: string;
    event: string;
    payload: unknown;
};

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

async function createStartedRoom(questionCount = 5) {
    await prisma.user.create({
        data: {
            name: "Host Auto Close",
            email: hostEmail,
            password: await hash(password, 10),
        },
    });

    const loginResponse = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });

    const token = loginResponse.body.token as string;

    const roomResponse = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Sala Timer Autoritativo",
            theme: "Sistemas Distribuídos",
            maxPlayers: 10,
            questionTime: 30,
        });

    const room = roomResponse.body as { id: string; code: string };

    await Promise.all(
        Array.from({ length: questionCount }, (_, index) =>
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

    await request(app)
        .post(`/rooms/${room.id}/start`)
        .set("Authorization", `Bearer ${token}`);

    return {
        token,
        room,
        alice: aliceJoin.body as {
            player: { id: string; nickname: string };
            sessionToken: string;
        },
        bob: bobJoin.body as {
            player: { id: string; nickname: string };
            sessionToken: string;
        },
    };
}

describe("Timer Autoritativo, Boot Recovery e Encerramento Automático - Integração", () => {
    const recordedEvents: RecordedSocketEvent[] = [];

    beforeAll(async () => {
        await cleanTestData();
        setSocketServer({
            to: (channel: string) => ({
                emit: (event: string, payload: unknown) => {
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

    it("1 e 2. deve encerrar rodada expirada automaticamente pelo worker sem host, calcular pontuações, emitir round:closed e recuperar estado completo após F5 (GET /rooms e GET /rooms/:code)", async () => {
        const { token, room, alice, bob } = await createStartedRoom(5);

        const roundStartRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);

        expect(roundStartRes.status).toBe(201);
        const round = roundStartRes.body.round as {
            id: string;
            openedAt: string;
            expiresAt: string;
            question: { options: Array<{ id: string; text: string; isCorrect?: boolean }> };
        };
        expect(round.openedAt).toBeTruthy();
        expect(round.expiresAt).toBeTruthy();

        // Alice responde antes do prazo; Bob não responde.
        const snapshotCorrectOption = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: round.id
                    ? (await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).snapshotQuestionId
                    : "",
                isCorrect: true,
            },
        });

        const aliceAnswerRes = await request(app)
            .post(`/rounds/${round.id}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: snapshotCorrectOption.id });
        expect(aliceAnswerRes.status).toBe(201);

        // Enquanto rodada está OPEN: GET /rooms e GET /rooms/:code trazem activeRound com expiresAt, answeredPlayers e SEM vazar isCorrect
        const hostRoomsOpen = await request(app)
            .get("/rooms")
            .set("Authorization", `Bearer ${token}`);
        expect(hostRoomsOpen.status).toBe(200);
        const listedGameOpen = hostRoomsOpen.body.rooms[0].currentGame;
        expect(listedGameOpen.activeRound).toBeTruthy();
        expect(listedGameOpen.activeRound.id).toBe(round.id);
        expect(listedGameOpen.activeRound.expiresAt).toBeTruthy();
        expect(listedGameOpen.activeRound.answeredCount).toBe(1);
        expect(listedGameOpen.activeRound.eligiblePlayerCount).toBe(2);
        expect(listedGameOpen.activeRound.answeredPlayers).toEqual([
            { id: alice.player.id, nickname: "Alice", avatarId: "explorer" },
        ]);
        for (const opt of listedGameOpen.activeRound.question.options) {
            expect(opt).not.toHaveProperty("isCorrect");
        }

        const lobbyOpenForBob = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${bob.sessionToken}`);
        expect(lobbyOpenForBob.status).toBe(200);
        expect(lobbyOpenForBob.body.room.currentGame.activeRound.id).toBe(round.id);
        for (const opt of lobbyOpenForBob.body.room.currentGame.activeRound.question.options) {
            expect(opt).not.toHaveProperty("isCorrect");
        }

        // Simular expiração no banco (tempo acabou enquanto host fechou aba/F5)
        await prisma.round.update({
            where: { id: round.id },
            data: { expiresAt: new Date(Date.now() - 1500) },
        });

        recordedEvents.length = 0;

        // Boot/Worker encerra automaticamente sem qualquer requisição do host
        const worker = new RoundExpirationWorker(new RoundService(), 5000);
        const closedCount = await worker.runCycle();
        expect(closedCount).toBe(1);

        const persistedRound = await prisma.round.findUniqueOrThrow({
            where: { id: round.id },
        });
        expect(persistedRound.status).toBe("CLOSED");
        expect(persistedRound.closedAt).not.toBeNull();

        const aliceDb = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: alice.player.id },
        });
        const bobDb = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: bob.player.id },
        });
        expect(aliceDb.score).toBeGreaterThan(0);
        expect(bobDb.score).toBe(0);

        const closedEvents = recordedEvents.filter((e) => e.event === "round:closed");
        expect(closedEvents).toHaveLength(1);
        expect(closedEvents[0].channel).toBe(`room:${room.id}`);
        expect(recordedEvents.some((e) => e.event === "game:finished")).toBe(false);

        // Após auto-encerramento (e antes da última rodada): Game permanece IN_PROGRESS e F5 do host vê lastClosedRound
        const hostLobbyAfterClose = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);
        expect(hostLobbyAfterClose.status).toBe(200);
        expect(hostLobbyAfterClose.body.room.status).toBe("IN_PROGRESS");
        expect(hostLobbyAfterClose.body.room.currentGame.activeRound).toBeNull();
        expect(hostLobbyAfterClose.body.room.currentGame.lastClosedRound.id).toBe(round.id);
        expect(hostLobbyAfterClose.body.room.currentGame.lastClosedRound.status).toBe("CLOSED");
        expect(hostLobbyAfterClose.body.room.currentGame.lastClosedRound.unansweredPlayers).toEqual([
            { id: bob.player.id, nickname: "Bob", avatarId: "explorer" },
        ]);
    });

    it("3. deve respeitar idempotência em execuções concorrentes do worker e POST /rounds/:id/close sem duplicar pontuação ou eventos", async () => {
        const { token, room, alice } = await createStartedRoom(5);

        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const roundId = roundRes.body.round.id as string;

        const roundDb = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
        const correctOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: roundDb.snapshotQuestionId, isCorrect: true },
        });

        await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: correctOpt.id });

        await prisma.round.update({
            where: { id: roundId },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });

        recordedEvents.length = 0;

        const roundService = new RoundService();
        const [w1, w2, httpClose1, httpClose2] = await Promise.all([
            roundService.processExpiredRounds(),
            roundService.processExpiredRounds(),
            request(app)
                .post(`/rounds/${roundId}/close`)
                .set("Authorization", `Bearer ${token}`),
            request(app)
                .post(`/rounds/${roundId}/close`)
                .set("Authorization", `Bearer ${token}`),
        ]);

        expect(httpClose1.status).toBe(200);
        expect(httpClose2.status).toBe(200);

        const closedEvents = recordedEvents.filter((e) => e.event === "round:closed");
        expect(closedEvents).toHaveLength(1);
        expect(w1 + w2).toBeLessThanOrEqual(1);

        // Segunda rodada do worker após encerramento não deve encerrar nem emitir nada
        expect(await roundService.processExpiredRounds()).toBe(0);
        expect(recordedEvents.filter((e) => e.event === "round:closed")).toHaveLength(1);
    });

    it("4. boot recovery: ao chamar worker.start() com rodada já expirada antes do boot, deve encerrar imediatamente na inicialização", async () => {
        const { token, room } = await createStartedRoom(5);

        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const roundId = roundRes.body.round.id as string;

        await prisma.round.update({
            where: { id: roundId },
            data: { expiresAt: new Date(Date.now() - 10_000) },
        });

        recordedEvents.length = 0;
        const worker = new RoundExpirationWorker(new RoundService(), 60_000);
        worker.start();

        // Aguardar varredura imediata de boot concluir e parar worker limpo
        await new Promise((resolve) => setTimeout(resolve, 250));
        await worker.stop();

        const roundDb = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
        expect(roundDb.status).toBe("CLOSED");
        expect(recordedEvents.some((e) => e.event === "round:closed")).toBe(true);
    });

    it("5. validação estrita de expiresAt: aceita resposta antes do prazo e rejeita com 409 ROUND_TIME_EXPIRED após expiresAt", async () => {
        const { token, room, alice, bob } = await createStartedRoom(5);

        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const roundId = roundRes.body.round.id as string;

        const roundDb = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
        const correctOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: roundDb.snapshotQuestionId, isCorrect: true },
        });

        // 1.2s antes de expirar: resposta deve ser aceita
        await prisma.round.update({
            where: { id: roundId },
            data: { expiresAt: new Date(Date.now() + 1200) },
        });

        const okAnswer = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: correctOpt.id });
        expect(okAnswer.status).toBe(201);

        // Expirado no timestamp autoritativo: Bob recebe 409 ROUND_TIME_EXPIRED mesmo que rodada ainda esteja OPEN
        await prisma.round.update({
            where: { id: roundId },
            data: { expiresAt: new Date(Date.now() - 200) },
        });

        const lateAnswer = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${bob.sessionToken}`)
            .send({ optionId: correctOpt.id });

        expect(lateAnswer.status).toBe(409);
        expect(lateAnswer.body.message).toBe(
            "O tempo para responder a esta rodada acabou.",
        );
    });

    it("6. última rodada encerrando por expiração automática (sem host) E por todos responderem deve finalizar Game (FINISHED + finishedAt) e emitir round:closed + game:finished", async () => {
        // Cenário A: última rodada fecha automaticamente quando todos os jogadores respondem
        const { token, room, alice, bob } = await createStartedRoom(5);

        for (let i = 1; i <= 5; i += 1) {
            const nextRound = await request(app)
                .post(`/rooms/${room.id}/rounds`)
                .set("Authorization", `Bearer ${token}`);
            expect(nextRound.status).toBe(201);
            const rId = nextRound.body.round.id as string;

            const rDb = await prisma.round.findUniqueOrThrow({ where: { id: rId } });
            const opt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
                where: { questionSnapshotId: rDb.snapshotQuestionId, isCorrect: i <= 4 },
            });

            if (i < 5) {
                // Rodadas 1..4 encerram por todos responderem, sem finalizar o Game ainda
                await request(app)
                    .post(`/rounds/${rId}/answer`)
                    .set("Authorization", `Bearer ${alice.sessionToken}`)
                    .send({ optionId: opt.id });
                await request(app)
                    .post(`/rounds/${rId}/answer`)
                    .set("Authorization", `Bearer ${bob.sessionToken}`)
                    .send({ optionId: opt.id });

                const midRound = await prisma.round.findUniqueOrThrow({ where: { id: rId } });
                expect(midRound.status).toBe("CLOSED");
                const midGame = await prisma.game.findUniqueOrThrow({ where: { id: rDb.gameId } });
                expect(midGame.status).toBe("IN_PROGRESS");
                expect(midGame.finishedAt).toBeNull();
            } else {
                // Na última rodada (5), primeiro testamos expiração automática via worker
                await request(app)
                    .post(`/rounds/${rId}/answer`)
                    .set("Authorization", `Bearer ${alice.sessionToken}`)
                    .send({ optionId: opt.id });

                await prisma.round.update({
                    where: { id: rId },
                    data: { expiresAt: new Date(Date.now() - 1000) },
                });

                recordedEvents.length = 0;
                const worker = new RoundExpirationWorker(new RoundService(), 5000);
                expect(await worker.runCycle()).toBe(1);

                const finalRound = await prisma.round.findUniqueOrThrow({ where: { id: rId } });
                expect(finalRound.status).toBe("CLOSED");

                const finalGame = await prisma.game.findUniqueOrThrow({ where: { id: rDb.gameId } });
                expect(finalGame.status).toBe("FINISHED");
                expect(finalGame.finishedAt).not.toBeNull();

                // Ordem garantida: round:closed antes de game:finished
                expect(recordedEvents.map((e) => e.event)).toEqual([
                    "round:closed",
                    "game:finished",
                ]);

                // F5 após finalização automática retorna FINISHED + ranking no lobby
                const finishedLobby = await request(app)
                    .get(`/rooms/${room.code}`)
                    .set("Authorization", `Bearer ${token}`);
                expect(finishedLobby.status).toBe(200);
                expect(finishedLobby.body.room.status).toBe("FINISHED");
                expect(finishedLobby.body.room.currentGame.status).toBe("FINISHED");
                expect(finishedLobby.body.room.currentGame.finishedAt).toBeTruthy();
                expect(finishedLobby.body.room.currentGame.activeRound).toBeNull();
                expect(finishedLobby.body.room.currentGame.players).toHaveLength(2);
            }
        }
    });

    it("7. última rodada encerrando por TODOS responderem (early close via POST /rounds/:id/answer) também finaliza Game e emite round:closed + game:finished", async () => {
        const { token, room, alice, bob } = await createStartedRoom(5);

        let lastRoundId = "";
        let lastGameId = "";

        for (let i = 1; i <= 5; i += 1) {
            const nextRound = await request(app)
                .post(`/rooms/${room.id}/rounds`)
                .set("Authorization", `Bearer ${token}`);
            lastRoundId = nextRound.body.round.id as string;

            const rDb = await prisma.round.findUniqueOrThrow({ where: { id: lastRoundId } });
            lastGameId = rDb.gameId;
            const opt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
                where: { questionSnapshotId: rDb.snapshotQuestionId, isCorrect: true },
            });

            if (i === 5) {
                recordedEvents.length = 0;
            }

            const aRes = await request(app)
                .post(`/rounds/${lastRoundId}/answer`)
                .set("Authorization", `Bearer ${alice.sessionToken}`)
                .send({ optionId: opt.id });
            expect(aRes.status).toBe(201);

            const bRes = await request(app)
                .post(`/rounds/${lastRoundId}/answer`)
                .set("Authorization", `Bearer ${bob.sessionToken}`)
                .send({ optionId: opt.id });
            expect(bRes.status).toBe(201);
        }

        const finalGame = await prisma.game.findUniqueOrThrow({ where: { id: lastGameId } });
        expect(finalGame.status).toBe("FINISHED");
        expect(finalGame.finishedAt).not.toBeNull();

        expect(recordedEvents.map((e) => e.event)).toEqual([
            "round:answer-submitted",
            "round:answer-submitted",
            "round:closed",
            "game:finished",
        ]);
    });
});
