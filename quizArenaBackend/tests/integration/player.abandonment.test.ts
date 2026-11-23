import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { PlayerPresenceRegistry } from "../../src/realtime/player-presence.js";
import { createSocketServer } from "../../src/realtime/socket.server.js";
import { PlayerAbandonmentRepository } from "../../src/rooms/player-abandonment.repository.js";
import { PlayerAbandonmentService } from "../../src/rooms/player-abandonment.service.js";
import { RoundExpirationWorker } from "../../src/rounds/round-expiration.worker.js";

const password = "12345678";
const hostEmail = "player.abandonment.host@email.com";

async function openPollingSocket(port: number, token: string) {
    const baseUrl = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;
    const openRes = await fetch(baseUrl);
    const openText = await openRes.text();
    const sid = (JSON.parse(openText.slice(1)) as { sid: string }).sid;

    await fetch(`${baseUrl}&sid=${sid}`, {
        method: "POST",
        body: `40${JSON.stringify({ token })}`,
    });

    const pollRes = await fetch(`${baseUrl}&sid=${sid}`);
    const pollText = await pollRes.text();
    if (pollText.includes("\x1e44") || pollText.startsWith("44")) {
        throw new Error(`SOCKET_AUTH_REJECTED:${pollText}`);
    }

    return {
        sid,
        close: async () => {
            await fetch(`${baseUrl}&sid=${sid}`, {
                method: "POST",
                body: "41",
            }).catch(() => undefined);
        },
    };
}

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

async function createRoomWithPlayers(maxPlayers = 2) {
    await prisma.user.create({
        data: {
            name: "Host Abandono",
            email: hostEmail,
            password: await hash(password, 10),
        },
    });

    const loginRes = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });
    const hostToken = loginRes.body.token as string;

    const roomRes = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${hostToken}`)
        .send({
            name: "Sala Abandono",
            theme: "Concorrência",
            maxPlayers,
            questionTime: 30,
        });
    const room = roomRes.body as {
        id: string;
        code: string;
        currentGame: { id: string };
    };

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

    return { hostToken, room };
}

describe("Abandono automático após 60 segundos - Integração", () => {
    let httpServer: HttpServer;
    let port: number;
    let presenceRegistry: PlayerPresenceRegistry;

    beforeAll(async () => {
        await prisma.$connect();
        presenceRegistry = new PlayerPresenceRegistry();
        httpServer = createServer(app);
        createSocketServer(httpServer, presenceRegistry);
        await new Promise<void>((resolve) => {
            httpServer.listen(0, "127.0.0.1", () => {
                const address = httpServer.address();
                port = typeof address === "object" && address ? address.port : 0;
                resolve();
            });
        });
    });

    beforeEach(async () => {
        await cleanTestData();
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
        await cleanTestData();
        await prisma.$disconnect();
    });

    it("WAITING: bloqueia reconexão ao expirar mesmo antes do worker, marca ABANDONED, libera vaga e permite reutilizar nickname", async () => {
        const { hostToken, room } = await createRoomWithPlayers(2);

        const anaJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect(anaJoin.status).toBe(201);
        expect(bobJoin.status).toBe(201);

        // Sala lotada inicialmente
        expect(
            (await request(app).get(`/rooms/${room.code}/availability`)).status,
        ).toBe(409);

        // Simula deadline expirado no banco antes mesmo do worker rodar
        await prisma.gamePlayer.update({
            where: { id: bobJoin.body.player.id },
            data: {
                disconnectedAt: new Date(Date.now() - 65_000),
                reconnectDeadlineAt: new Date(Date.now() - 5_000),
            },
        });

        // Mesmo antes do worker executar, reconexão Socket.IO e HTTP lobby são bloqueados
        await expect(
            openPollingSocket(port, bobJoin.body.sessionToken),
        ).rejects.toThrow(/SOCKET_AUTH_REJECTED/);

        const lobbyExpiredAttempt = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`);
        expect(lobbyExpiredAttempt.status).toBe(401);

        // Worker executa e marca Bob como ABANDONED
        const worker = new RoundExpirationWorker(undefined, 1000, new PlayerAbandonmentService(), 5000);
        const abandonedCount = await worker.runAbandonmentCycle();
        expect(abandonedCount).toBe(1);

        const bobAfter = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: bobJoin.body.player.id },
        });
        expect(bobAfter.status).toBe("ABANDONED");
        expect(bobAfter.sessionTokenHash).toBeNull();
        expect(bobAfter.disconnectedAt).toBeNull();
        expect(bobAfter.reconnectDeadlineAt).toBeNull();
        expect(bobAfter.nickname).toBe("Bob");

        // Vaga e nickname "Bob" foram liberados no WAITING
        expect(
            (await request(app).get(`/rooms/${room.code}/availability`)).status,
        ).toBe(200);

        const newBobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });
        expect(newBobJoin.status).toBe(201);
        expect(newBobJoin.body.player.id).not.toBe(bobJoin.body.player.id);

        // Host consegue iniciar a partida normalmente com Ana + novo Bob
        const startRes = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(startRes.status).toBe(200);
    });

    it("IN_PROGRESS: abandono automático preserva score/respostas, fecha rodada aberta se restantes responderam e mantém idempotência", async () => {
        const { hostToken, room } = await createRoomWithPlayers(4);

        const anaJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });
        const carolJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carol" });

        await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);

        // Rodada 1: todos respondem para Carol acumular pontuação
        const r1Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        const r1Id = r1Res.body.round.id as string;
        const r1Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: r1Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        for (const p of [anaJoin, bobJoin, carolJoin]) {
            expect(
                (
                    await request(app)
                        .post(`/rounds/${r1Id}/answer`)
                        .set("Authorization", `Bearer ${p.body.sessionToken}`)
                        .send({ optionId: r1Correct.id })
                ).status,
            ).toBe(201);
        }

        const carolScoreBefore = (
            await prisma.gamePlayer.findUniqueOrThrow({
                where: { id: carolJoin.body.player.id },
            })
        ).score;
        expect(carolScoreBefore).toBeGreaterThan(0);

        // Rodada 2: apenas Ana e Bob respondem; Carol fica com deadline expirado
        const r2Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        const r2Id = r2Res.body.round.id as string;
        const r2Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: r2Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        await request(app)
            .post(`/rounds/${r2Id}/answer`)
            .set("Authorization", `Bearer ${anaJoin.body.sessionToken}`)
            .send({ optionId: r2Correct.id });
        await request(app)
            .post(`/rounds/${r2Id}/answer`)
            .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`)
            .send({ optionId: r2Correct.id });

        await prisma.gamePlayer.update({
            where: { id: carolJoin.body.player.id },
            data: {
                disconnectedAt: new Date(Date.now() - 62_000),
                reconnectDeadlineAt: new Date(Date.now() - 2_000),
            },
        });

        // Antes do worker, Carol já não pode responder nem reconectar
        const carolLateAnswer = await request(app)
            .post(`/rounds/${r2Id}/answer`)
            .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`)
            .send({ optionId: r2Correct.id });
        expect(carolLateAnswer.status).toBe(401);

        // Worker executa no boot (start) após reinicialização simulada
        const bootWorker = new RoundExpirationWorker();
        bootWorker.start();
        await new Promise((r) => setTimeout(r, 150));
        await bootWorker.stop();

        // Carol marcada como ABANDONED com histórico intacto e Rodada 2 fechada automaticamente
        const carolAbandoned = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: carolJoin.body.player.id },
            include: { answers: true },
        });
        expect(carolAbandoned.status).toBe("ABANDONED");
        expect(carolAbandoned.sessionTokenHash).toBeNull();
        expect(carolAbandoned.score).toBe(carolScoreBefore);
        expect(carolAbandoned.answers).toHaveLength(1);

        const r2After = await prisma.round.findUniqueOrThrow({
            where: { id: r2Id },
        });
        expect(r2After.status).toBe("CLOSED");

        // Nova execução do worker é idempotente
        expect(await bootWorker.runAbandonmentCycle()).toBe(0);

        // Resultados da partida preservam Carol e sua pontuação
        await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${hostToken}`);
        const resultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${room.currentGame.id}/results`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(resultsRes.status).toBe(200);
        expect(
            (
                resultsRes.body.game.ranking as Array<{ id: string; score: number }>
            ).find((entry) => entry.id === carolJoin.body.player.id)?.score,
        ).toBe(carolScoreBefore);
    });

    it("proteção contra corrida: jogador com socket ativo ou reconectado antes do deadline nunca é abandonado mesmo com deadline obsoleto", async () => {
        const { room } = await createRoomWithPlayers(4);

        const anaJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        // Ana conecta socket ativo e recebe um deadline obsoleto no banco
        const anaSock = await openPollingSocket(port, anaJoin.body.sessionToken);
        await presenceRegistry.whenIdle(anaJoin.body.player.id);
        await prisma.gamePlayer.update({
            where: { id: anaJoin.body.player.id },
            data: {
                disconnectedAt: new Date(Date.now() - 65_000),
                reconnectDeadlineAt: new Date(Date.now() - 5_000),
            },
        });

        // Bob desconecta com prazo ainda válido (+30s) e reconecta pelo Socket.IO
        await prisma.gamePlayer.update({
            where: { id: bobJoin.body.player.id },
            data: {
                disconnectedAt: new Date(Date.now() - 10_000),
                reconnectDeadlineAt: new Date(Date.now() + 30_000),
            },
        });
        const bobSock = await openPollingSocket(port, bobJoin.body.sessionToken);
        await presenceRegistry.whenIdle(bobJoin.body.player.id);

        // Processa abandonos: Ana tem socket ativo e Bob reconectou -> nenhum é abandonado
        const repo = new PlayerAbandonmentRepository();
        const anaRes = await repo.abandonExpiredPlayer(
            anaJoin.body.player.id,
            (pid) => presenceRegistry.getActiveSocketCount(pid) > 0,
        );
        const bobRes = await repo.abandonExpiredPlayer(
            bobJoin.body.player.id,
            (pid) => presenceRegistry.getActiveSocketCount(pid) > 0,
        );

        expect(anaRes).toEqual({
            abandoned: false,
            reason: "HAS_ACTIVE_SOCKET",
        });
        expect(bobRes).toEqual({
            abandoned: false,
            reason: "ALREADY_RECONNECTED",
        });

        const anaInDb = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: anaJoin.body.player.id },
        });
        expect(anaInDb.status).toBe("ACTIVE");
        expect(anaInDb.disconnectedAt).toBeNull();
        expect(anaInDb.reconnectDeadlineAt).toBeNull();

        await anaSock.close();
        await bobSock.close();
    });
});
