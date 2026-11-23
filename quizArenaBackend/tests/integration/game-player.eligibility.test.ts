import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { RoundAnswerRepository } from "../../src/round-answers/round-answer.repository.js";
import { setSocketServer } from "../../src/realtime/room-events.js";

const password = "12345678";
const hostEmail = "game-player.eligibility.host@email.com";

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
            name: "Host Elegibilidade",
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
            name: "Sala Elegibilidade",
            theme: "Arquitetura",
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

    return {
        token,
        room,
    };
}

describe("GamePlayer status & elegibilidade - Integração", () => {
    const recordedEvents: RecordedSocketEvent[] = [];

    beforeAll(async () => {
        await prisma.$connect();
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

    it("novos participantes nascem ACTIVE e apenas ACTIVE contam para lotação, lobby WAITING e início da partida", async () => {
        const { token, room } = await createHostAndRoom(2, 5);

        const join1 = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const join2 = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect(join1.status).toBe(201);
        expect(join2.status).toBe(201);
        expect(join1.body.player.status).toBe("ACTIVE");
        expect(join2.body.player.status).toBe("ACTIVE");

        const dbPlayers = await prisma.gamePlayer.findMany({
            where: { gameId: room.currentGame.id },
            orderBy: { joinedAt: "asc" },
        });
        expect(dbPlayers.map((p) => p.status)).toEqual(["ACTIVE", "ACTIVE"]);

        // Sala com 2/2 ativos está lotada.
        const availFull = await request(app).get(
            `/rooms/${room.code}/availability`,
        );
        expect(availFull.status).toBe(409);

        // Marca Bob como LEFT no banco para simular saída sem endpoints de saída ainda.
        await prisma.gamePlayer.update({
            where: { id: join2.body.player.id },
            data: { status: "LEFT" },
        });

        // Token do jogador LEFT perde acesso ao lobby.
        const leftLobbyAttempt = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${join2.body.sessionToken}`);
        expect(leftLobbyAttempt.status).toBe(401);

        // Host vê apenas 1 ativo no lobby WAITING e não consegue iniciar com < 2 ativos.
        const hostLobby = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);
        expect(hostLobby.status).toBe(200);
        expect(hostLobby.body.room.playerCount).toBe(1);
        expect(hostLobby.body.room.currentGame.eligiblePlayerCount).toBe(1);
        expect(
            (hostLobby.body.room.players as Array<{ id: string }>).map(
                (p) => p.id,
            ),
        ).toEqual([join1.body.player.id]);

        const startBlocked = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startBlocked.status).toBe(409);

        // Disponibilidade libera a vaga antes ocupada pelo jogador LEFT, permitindo novo ingresso ACTIVE.
        const availOpen = await request(app).get(
            `/rooms/${room.code}/availability`,
        );
        expect(availOpen.status).toBe(200);
        expect(availOpen.body.room.available).toBe(true);

        const join3 = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carol" });
        expect(join3.status).toBe(201);
        expect(join3.body.player.status).toBe("ACTIVE");

        // Com 2 ativos (Ana e Carol), nova tentativa falha por lotação e o start é permitido.
        const join4Blocked = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Dave" });
        expect(join4Blocked.status).toBe(409);

        const startAllowed = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startAllowed.status).toBe(200);
        expect(startAllowed.body.status).toBe("IN_PROGRESS");
    });

    it("jogador ABANDONED não pode autenticar nem responder, não trava auto-close e mantém pontuação/histórico preservados", async () => {
        const { token, room } = await createHostAndRoom(4, 5);

        const aliceJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });
        const carolJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carol" });

        expect(aliceJoin.status).toBe(201);
        expect(bobJoin.status).toBe(201);
        expect(carolJoin.status).toBe(201);

        const startRes = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startRes.status).toBe(200);

        // Rodada 1: todos os 3 respondem; Carol pontua antes de virar ABANDONED.
        const round1Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(round1Res.status).toBe(201);
        const round1Id = round1Res.body.round.id as string;
        const r1Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: round1Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        expect(
            (
                await request(app)
                    .post(`/rounds/${round1Id}/answer`)
                    .set("Authorization", `Bearer ${aliceJoin.body.sessionToken}`)
                    .send({ optionId: r1Correct.id })
            ).status,
        ).toBe(201);
        expect(
            (
                await request(app)
                    .post(`/rounds/${round1Id}/answer`)
                    .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`)
                    .send({ optionId: r1Correct.id })
            ).status,
        ).toBe(201);
        expect(
            (
                await request(app)
                    .post(`/rounds/${round1Id}/answer`)
                    .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`)
                    .send({ optionId: r1Correct.id })
            ).status,
        ).toBe(201);

        const round1After = await prisma.round.findUniqueOrThrow({
            where: { id: round1Id },
        });
        expect(round1After.status).toBe("CLOSED");

        // Marca Carol como ABANDONED no banco.
        await prisma.gamePlayer.update({
            where: { id: carolJoin.body.player.id },
            data: { status: "ABANDONED" },
        });

        // Rodada 2 abre.
        const round2Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(round2Res.status).toBe(201);
        const round2Id = round2Res.body.round.id as string;
        const r2Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: round2Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        // Carol (ABANDONED) é bloqueada no HTTP (401 no middleware e no lobby) e no repositório (PLAYER_INACTIVE).
        const carolAnswerHttp = await request(app)
            .post(`/rounds/${round2Id}/answer`)
            .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`)
            .send({ optionId: r2Correct.id });
        expect(carolAnswerHttp.status).toBe(401);

        const carolLobbyHttp = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${carolJoin.body.sessionToken}`);
        expect(carolLobbyHttp.status).toBe(401);

        const repoResult = await new RoundAnswerRepository().submitAnswer(
            round2Id,
            carolJoin.body.player.id,
            r2Correct.id,
        );
        expect(repoResult).toEqual({
            success: false,
            reason: "PLAYER_INACTIVE",
        });

        // Host consulta lobby em andamento: eligiblePlayerCount === 2, mas Carol segue listada com pontuação histórica.
        const lobbyDuringRound2 = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);
        expect(lobbyDuringRound2.status).toBe(200);
        expect(lobbyDuringRound2.body.room.currentGame.eligiblePlayerCount).toBe(2);
        expect(lobbyDuringRound2.body.room.currentGame.activeRound.eligiblePlayerCount).toBe(2);
        expect(lobbyDuringRound2.body.room.players).toHaveLength(3);

        recordedEvents.length = 0;

        // Apenas Alice e Bob (os 2 ACTIVE) respondem a Rodada 2 -> fecha automaticamente sem Carol.
        expect(
            (
                await request(app)
                    .post(`/rounds/${round2Id}/answer`)
                    .set("Authorization", `Bearer ${aliceJoin.body.sessionToken}`)
                    .send({ optionId: r2Correct.id })
            ).status,
        ).toBe(201);
        expect(
            (
                await request(app)
                    .post(`/rounds/${round2Id}/answer`)
                    .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`)
                    .send({ optionId: r2Correct.id })
            ).status,
        ).toBe(201);

        const round2After = await prisma.round.findUniqueOrThrow({
            where: { id: round2Id },
        });
        expect(round2After.status).toBe("CLOSED");

        const roundClosedEvent = recordedEvents.find(
            (e) => e.event === "round:closed",
        )?.payload as {
            round: {
                unansweredPlayers: Array<{ id: string; nickname: string }>;
                ranking: Array<{ id: string; nickname: string; score: number }>;
            };
        };
        expect(roundClosedEvent).toBeDefined();
        expect(roundClosedEvent.round.unansweredPlayers).toEqual([]);
        expect(
            roundClosedEvent.round.ranking.some(
                (entry) => entry.id === carolJoin.body.player.id,
            ),
        ).toBe(false);
        expect(
            roundClosedEvent.round.ranking.map((entry) => entry.id).sort(),
        ).toEqual([aliceJoin.body.player.id, bobJoin.body.player.id].sort());

        // Recuperação via GET /rooms/:code reconstruindo lastClosedRound também exclui Carol (ABANDONED) do ranking competitivo
        const recoveryAfterR2 = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${aliceJoin.body.sessionToken}`);
        expect(recoveryAfterR2.status).toBe(200);
        const recoveredRanking = recoveryAfterR2.body.room.currentGame
            .lastClosedRound.ranking as Array<{ id: string }>;
        expect(
            recoveredRanking.some(
                (entry) => entry.id === carolJoin.body.player.id,
            ),
        ).toBe(false);
        expect(recoveredRanking.map((entry) => entry.id).sort()).toEqual(
            [aliceJoin.body.player.id, bobJoin.body.player.id].sort(),
        );

        // Score e respostas anteriores de Carol permanecem preservados no banco de dados
        const carolInDb = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: carolJoin.body.player.id },
            include: { answers: true },
        });
        expect(carolInDb.status).toBe("ABANDONED");
        expect(carolInDb.score).toBeGreaterThan(0);
        expect(carolInDb.answers).toHaveLength(1);

        // Encerra partida antecipadamente e confirma histórico e resultados completos (incluindo Carol).
        const finishRes = await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${token}`);
        expect(finishRes.status).toBe(200);

        const gamesRes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(gamesRes.status).toBe(200);
        expect(gamesRes.body.games[0].playerCount).toBe(3);

        const resultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${room.currentGame.id}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(resultsRes.status).toBe(200);
        const rankingIds = (
            resultsRes.body.game.ranking as Array<{ id: string; score: number }>
        ).map((entry) => entry.id);
        expect(rankingIds).toContain(carolJoin.body.player.id);
    });

    it("ranking competitivo inclui ACTIVE desconectado nos 60s, exclui LEFT/ABANDONED no round:closed e lastClosedRound, e preserva histórico", async () => {
        const { token, room } = await createHostAndRoom(5, 5);

        const aliceJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const bobJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });
        const carolJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carol" });
        const daveJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Dave" });

        await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        // Rodada 1: todos respondem para acumular pontuação antes de transições de status
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

        for (const p of [aliceJoin, bobJoin, carolJoin, daveJoin]) {
            await request(app)
                .post(`/rounds/${r1Id}/answer`)
                .set("Authorization", `Bearer ${p.body.sessionToken}`)
                .send({ optionId: r1Correct.id });
        }

        // Bob sai voluntariamente (LEFT), Carol abandona (ABANDONED), Dave desconecta dentro dos 60s (ACTIVE)
        await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bobJoin.body.sessionToken}`);

        await prisma.gamePlayer.update({
            where: { id: carolJoin.body.player.id },
            data: { status: "ABANDONED", sessionTokenHash: null },
        });

        await prisma.gamePlayer.update({
            where: { id: daveJoin.body.player.id },
            data: {
                disconnectedAt: new Date(),
                reconnectDeadlineAt: new Date(Date.now() + 50_000),
            },
        });

        // Rodada 2 abre e encerra manualmente após resposta de Alice
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

        await request(app)
            .post(`/rounds/${r2Id}/answer`)
            .set("Authorization", `Bearer ${aliceJoin.body.sessionToken}`)
            .send({ optionId: r2Correct.id });

        recordedEvents.length = 0;

        const closeRes = await request(app)
            .post(`/rounds/${r2Id}/close`)
            .set("Authorization", `Bearer ${token}`);
        expect(closeRes.status).toBe(200);

        const r2ClosedEvent = recordedEvents.find(
            (e) => e.event === "round:closed",
        )?.payload as {
            round: {
                ranking: Array<{ id: string; score: number }>;
            };
        };

        const eventRankingIds = r2ClosedEvent.round.ranking.map((r) => r.id);
        expect(eventRankingIds).toContain(aliceJoin.body.player.id);
        expect(eventRankingIds).toContain(daveJoin.body.player.id);
        expect(eventRankingIds).not.toContain(bobJoin.body.player.id);
        expect(eventRankingIds).not.toContain(carolJoin.body.player.id);
        expect(r2ClosedEvent.round.ranking[0]?.id).toBe(aliceJoin.body.player.id);

        // Reconstrução de lastClosedRound em GET /rooms/:code segue a mesma filtragem
        const lobbyRes = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${token}`);
        expect(lobbyRes.status).toBe(200);
        const lobbyRankingIds = (
            lobbyRes.body.room.currentGame.lastClosedRound.ranking as Array<{
                id: string;
            }>
        ).map((r) => r.id);
        expect(lobbyRankingIds).toEqual(eventRankingIds);

        // Histórico final mantém todos os 4 jogadores (ACTIVE, LEFT e ABANDONED) e seus scores
        await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${token}`);
        const resultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${room.currentGame.id}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(resultsRes.status).toBe(200);
        expect(resultsRes.body.game.ranking).toHaveLength(4);
    });
});
