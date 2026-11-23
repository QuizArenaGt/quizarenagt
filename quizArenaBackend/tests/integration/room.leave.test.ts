import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { setSocketServer } from "../../src/realtime/room-events.js";
import { hashRoomPlayerSessionToken } from "../../src/rooms/room-player-session-token.js";

const password = "12345678";
const hostEmail = "room.leave.host@email.com";

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

async function createHostAndRoom(maxPlayers = 2, questionCount = 5) {
    await prisma.user.create({
        data: {
            name: "Host Saída Voluntária",
            email: hostEmail,
            password: await hash(password, 10),
        },
    });

    const loginRes = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });

    const token = loginRes.body.token as string;

    const roomRes = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Sala Saída Voluntária",
            theme: "Testes",
            maxPlayers,
            questionTime: 30,
        });

    expect(roomRes.status).toBe(201);

    const room = roomRes.body as {
        id: string;
        code: string;
        currentGame: { id: string };
    };

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

    return { token, room };
}

describe("POST /rooms/leave - Integração", () => {
    const recordedEvents: RecordedSocketEvent[] = [];
    const disconnectedSockets: string[] = [];

    beforeAll(async () => {
        await prisma.$connect();
        setSocketServer({
            to: (channel: string) => ({
                emit: (event: string, payload: unknown) => {
                    recordedEvents.push({ channel, event, payload });
                },
            }),
            in: () => ({
                fetchSockets: async () => [
                    {
                        data: { identity: { type: "HOST", userId: "host" } },
                        leave: () => {},
                        disconnect: () => {
                            disconnectedSockets.push("host");
                        },
                    },
                ],
            }),
        } as never);
    });

    beforeEach(async () => {
        recordedEvents.length = 0;
        disconnectedSockets.length = 0;
        await cleanTestData();
    });

    afterAll(async () => {
        setSocketServer(null as never);
        await cleanTestData();
        await prisma.$disconnect();
    });

    it("WAITING: remove GamePlayer do banco, libera vaga e nickname, atualiza contagem, emite player:left e rejeita saída duplicada", async () => {
        const { token, room } = await createHostAndRoom(2, 5);

        const anaJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect(anaJoin.status).toBe(201);
        expect(bobJoin.status).toBe(201);

        // Lotada antes da saída.
        expect(
            (await request(app).get(`/rooms/${room.code}/availability`)).status,
        ).toBe(409);

        recordedEvents.length = 0;

        // Bob sai voluntariamente em WAITING.
        const leaveRes = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`);

        expect(leaveRes.status).toBe(200);
        expect(leaveRes.body).toMatchObject({
            roomId: room.id,
            gameId: room.currentGame.id,
            gameStatus: "WAITING",
            eligiblePlayerCount: 1,
            player: {
                id: bobJoin.body.player.id,
                nickname: "Bob",
                status: "LEFT",
            },
        });

        // Registro de Bob removido definitivamente do banco.
        const bobInDb = await prisma.gamePlayer.findUnique({
            where: { id: bobJoin.body.player.id },
        });
        expect(bobInDb).toBeNull();

        // Evento player:left emitido.
        const leftEvent = recordedEvents.find((e) => e.event === "player:left");
        expect(leftEvent).toEqual({
            channel: `room:${room.id}`,
            event: "player:left",
            payload: {
                roomId: room.id,
                gameId: room.currentGame.id,
                gameStatus: "WAITING",
                player: {
                    id: bobJoin.body.player.id,
                    nickname: "Bob",
                    avatarId: "explorer",
                    status: "LEFT",
                    score: 0,
                },
                eligiblePlayerCount: 1,
            },
        });

        // Lobby do host atualizou para 1 jogador.
        const lobbyRes = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);
        expect(lobbyRes.status).toBe(200);
        expect(lobbyRes.body.room.playerCount).toBe(1);
        expect(lobbyRes.body.room.players.map((p: { nickname: string }) => p.nickname)).toEqual([
            "Ana",
        ]);

        // Saída duplicada e acesso com token antigo rejeitados com 401.
        const dupLeave = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`);
        expect(dupLeave.status).toBe(401);

        const unauthLeave = await request(app).post("/rooms/leave");
        expect(unauthLeave.status).toBe(401);

        // Vaga e nickname "Bob" foram liberados para novo jogador.
        expect(
            (await request(app).get(`/rooms/${room.code}/availability`)).status,
        ).toBe(200);

        const bobRejoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });
        expect(bobRejoin.status).toBe(201);
        expect(bobRejoin.body.player.id).not.toBe(bobJoin.body.player.id);

        // Com Ana e novo Bob, partida pode iniciar normalmente.
        const startRes = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startRes.status).toBe(200);
    });

    it("IN_PROGRESS: marca LEFT, invalida token, preserva score/respostas/histórico, bloqueia novas respostas e suporta saída concorrente segura", async () => {
        const { token, room } = await createHostAndRoom(4, 5);

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
            .set("Authorization", `Bearer ${token}`);

        // Rodada 1: todos os 3 respondem e Carol ganha pontos antes de sair.
        const r1Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
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

        const carolAfterR1 = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: carolJoin.body.player.id },
        });
        expect(carolAfterR1.score).toBeGreaterThan(0);

        // Rodada 2 abre.
        const r2Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const r2Id = r2Res.body.round.id as string;
        const r2Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: r2Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        recordedEvents.length = 0;

        // Carol dispara duas requisições concorrentes de saída.
        const [leave1, leave2] = await Promise.all([
            request(app)
                .post("/rooms/leave")
                .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`),
            request(app)
                .post("/rooms/leave")
                .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`),
        ]);

        const statuses = [leave1.status, leave2.status].sort();
        expect(statuses).toEqual([200, 401]);

        const leftEvents = recordedEvents.filter((e) => e.event === "player:left");
        expect(leftEvents).toHaveLength(1);
        expect(leftEvents[0]).toMatchObject({
            channel: `room:${room.id}`,
            event: "player:left",
            payload: {
                roomId: room.id,
                gameId: room.currentGame.id,
                gameStatus: "IN_PROGRESS",
                player: {
                    id: carolJoin.body.player.id,
                    nickname: "Carol",
                    status: "LEFT",
                    score: carolAfterR1.score,
                },
                eligiblePlayerCount: 2,
            },
        });

        // Token invalidado e status LEFT com score e respostas anteriores preservadas no banco.
        const carolInDb = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: carolJoin.body.player.id },
            include: { answers: true },
        });
        expect(carolInDb.status).toBe("LEFT");
        expect(carolInDb.sessionTokenHash).toBeNull();
        expect(carolInDb.score).toBe(carolAfterR1.score);
        expect(carolInDb.answers).toHaveLength(1);

        // Token antigo não consegue mais buscar lobby nem enviar novas respostas.
        expect(
            (
                await request(app)
                    .get(`/rooms/${room.code}`)
                    .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`)
            ).status,
        ).toBe(401);
        expect(
            (
                await request(app)
                    .post(`/rounds/${r2Id}/answer`)
                    .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`)
                    .send({ optionId: r2Correct.id })
            ).status,
        ).toBe(401);

        // Rodada 2 não fechou porque Ana e Bob ainda não responderam.
        expect(
            (await prisma.round.findUniqueOrThrow({ where: { id: r2Id } })).status,
        ).toBe("OPEN");

        // Encerra partida e verifica histórico preservando Carol e sua pontuação.
        await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${token}`);

        const resultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${room.currentGame.id}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(resultsRes.status).toBe(200);
        const carolRank = (
            resultsRes.body.game.ranking as Array<{ id: string; score: number }>
        ).find((entry) => entry.id === carolJoin.body.player.id);
        expect(carolRank?.score).toBe(carolAfterR1.score);

        // Não permite sair após partida FINISHED (mesmo se token fosse válido em cenário residual).
        const syntheticToken = "residual-finished-token";
        await prisma.gamePlayer.update({
            where: { id: anaJoin.body.player.id },
            data: { sessionTokenHash: hashRoomPlayerSessionToken(syntheticToken) },
        });
        const leaveAfterFinish = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${syntheticToken}`);
        expect(leaveAfterFinish.status).toBe(409);
    });

    it("encerramento antecipado: ao sair o único jogador ACTIVE que ainda não respondeu, encerra a rodada uma única vez e preserva pontuações", async () => {
        const { token, room } = await createHostAndRoom(4, 5);

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
            .set("Authorization", `Bearer ${token}`);

        const r1Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const r1Id = r1Res.body.round.id as string;
        const r1Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: r1Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        // Ana e Bob respondem; Carol ainda não respondeu.
        expect(
            (
                await request(app)
                    .post(`/rounds/${r1Id}/answer`)
                    .set("Authorization", `Bearer ${anaJoin.body.sessionToken}`)
                    .send({ optionId: r1Correct.id })
            ).status,
        ).toBe(201);
        expect(
            (
                await request(app)
                    .post(`/rounds/${r1Id}/answer`)
                    .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`)
                    .send({ optionId: r1Correct.id })
            ).status,
        ).toBe(201);

        expect(
            (await prisma.round.findUniqueOrThrow({ where: { id: r1Id } })).status,
        ).toBe("OPEN");

        recordedEvents.length = 0;

        // Carol sai -> todos os restantes (Ana e Bob) já responderam -> rodada fecha automaticamente!
        const carolLeave = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`);

        expect(carolLeave.status).toBe(200);

        const r1After = await prisma.round.findUniqueOrThrow({
            where: { id: r1Id },
        });
        expect(r1After.status).toBe("CLOSED");

        const leftEvents = recordedEvents.filter((e) => e.event === "player:left");
        const closedEvents = recordedEvents.filter((e) => e.event === "round:closed");
        expect(leftEvents).toHaveLength(1);
        expect(closedEvents).toHaveLength(1);

        const closedPayload = closedEvents[0]!.payload as {
            round: {
                unansweredPlayers: Array<{ id: string }>;
                ranking: Array<{ id: string; score: number }>;
            };
        };
        expect(closedPayload.round.unansweredPlayers).toEqual([]);
        expect(
            closedPayload.round.ranking.find((p) => p.id === anaJoin.body.player.id)
                ?.score,
        ).toBeGreaterThan(0);
        expect(
            closedPayload.round.ranking.find((p) => p.id === bobJoin.body.player.id)
                ?.score,
        ).toBeGreaterThan(0);

        // Chamar POST /rounds/:id/close depois é idempotente e não emite evento duplicado.
        const manualCloseRes = await request(app)
            .post(`/rounds/${r1Id}/close`)
            .set("Authorization", `Bearer ${token}`);
        expect(manualCloseRes.status).toBe(200);
        expect(recordedEvents.filter((e) => e.event === "round:closed")).toHaveLength(1);
    });
});
