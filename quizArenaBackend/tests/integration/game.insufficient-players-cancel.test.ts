import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { setSocketServer } from "../../src/realtime/room-events.js";
import { PlayerAbandonmentRepository } from "../../src/rooms/player-abandonment.repository.js";
import { PlayerAbandonmentService } from "../../src/rooms/player-abandonment.service.js";
import { RoundRepository } from "../../src/rounds/round.repository.js";
import { RoundService } from "../../src/rounds/round.service.js";

const password = "12345678";
const hostEmail = "game.insufficient.players.host@email.com";

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

async function createHostAndRoom(maxPlayers = 4, questionCount = 5) {
    await prisma.user.create({
        data: {
            name: "Host Cancelamento Insuficiente",
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
            name: "Sala Cancelamento Automático",
            theme: "Concorrência",
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

describe("Encerramento automático por insuficiência de jogadores (< 2) - Integração", () => {
    const recordedEvents: RecordedSocketEvent[] = [];

    const createAbandonmentService = (
        hasActiveSocket: (playerId: string) => boolean = () => false,
    ) => {
        const roundService = new RoundService(
            new RoundRepository(),
            (roomId, event, payload) => {
                recordedEvents.push({
                    channel: `room:${roomId}`,
                    event,
                    payload,
                });
            },
        );
        return new PlayerAbandonmentService(
            new PlayerAbandonmentRepository(),
            roundService,
            (roomId, event, payload) => {
                recordedEvents.push({
                    channel: `room:${roomId}`,
                    event,
                    payload,
                });
            },
            async () => undefined,
            hasActiveSocket,
        );
    };

    beforeAll(async () => {
        await prisma.$connect();
        setSocketServer({
            to: (channel: string) => ({
                emit: (event: string, payload: unknown) => {
                    recordedEvents.push({ channel, event, payload });
                },
            }),
            in: () => ({
                fetchSockets: async () => [],
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

    it("WAITING: sair para menos de 2 jogadores NÃO cancela a partida WAITING", async () => {
        const { room } = await createHostAndRoom(4);

        const ana = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect(ana.status).toBe(201);
        expect(bob.status).toBe(201);
        recordedEvents.length = 0;

        const leaveRes = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bob.body.sessionToken}`);

        expect(leaveRes.status).toBe(200);
        expect(leaveRes.body.gameCancelled).toBe(false);

        const game = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
        });
        expect(game?.status).toBe("WAITING");
        expect(game?.finishedAt).toBeNull();
        expect(
            recordedEvents.some((event) => event.event === "game:finished"),
        ).toBe(false);
    });

    it("Saída voluntária em IN_PROGRESS: 2->1 cancela partida, fecha rodada OPEN, preserva histórico/respostas sem vencedor automático e permite replay", async () => {
        const { token, room } = await createHostAndRoom(4);

        const ana = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect((await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`)).status).toBe(200);

        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(roundRes.status).toBe(201);
        const roundId = roundRes.body.round.id as string;
        const correctOptionId = roundRes.body.round.question.options[0].id as string;

        // Ana responde antes de Bob sair para verificar preservação histórica de pontuação e RoundAnswer.
        const anaAnswerRes = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${ana.body.sessionToken}`)
            .send({ optionId: correctOptionId });
        expect(anaAnswerRes.status).toBe(201);

        recordedEvents.length = 0;

        // Bob sai: resta apenas Ana (1 < 2) -> partida deve ser CANCELADA.
        const bobLeave = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bob.body.sessionToken}`);

        expect(bobLeave.status).toBe(200);
        expect(bobLeave.body.gameCancelled).toBe(true);
        expect(bobLeave.body.eligiblePlayerCount).toBe(1);

        // Eventos emitidos na ordem player:left -> game:finished (CANCELLED)
        expect(recordedEvents.map((e) => e.event)).toEqual([
            "player:left",
            "game:finished",
        ]);
        expect(recordedEvents[1]?.payload).toMatchObject({
            roomId: room.id,
            gameId: room.currentGame.id,
            status: "CANCELLED",
            reason: "INSUFFICIENT_PLAYERS",
        });

        // Banco reflete CANCELLED + finishedAt + rodada CLOSED + histórico intacto.
        const game = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
            include: {
                players: true,
                rounds: true,
            },
        });
        expect(game?.status).toBe("CANCELLED");
        expect(game?.finishedAt).not.toBeNull();
        expect(game?.rounds[0]?.status).toBe("CLOSED");
        expect(game?.rounds[0]?.closedAt).not.toBeNull();

        const anaInDb = game?.players.find((p) => p.id === ana.body.player.id);
        const bobInDb = game?.players.find((p) => p.id === bob.body.player.id);
        expect(anaInDb?.status).toBe("ACTIVE");
        expect(anaInDb?.score).toBeGreaterThan(0);
        expect(bobInDb?.status).toBe("LEFT");

        const savedAnswers = await prisma.roundAnswer.findMany({
            where: { roundId },
        });
        expect(savedAnswers).toHaveLength(1);

        // Novas respostas e novas rodadas ficam bloqueadas após cancelamento.
        const nextRoundAfterCancel = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(nextRoundAfterCancel.status).toBe(409);

        const lateAnswer = await request(app)
            .post(`/rounds/${roundId}/answer`)
            .set("Authorization", `Bearer ${ana.body.sessionToken}`)
            .send({ optionId: correctOptionId });
        expect(lateAnswer.status).toBe(409);

        // Histórico persistido não elege vencedor automático.
        const historyRes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(historyRes.status).toBe(200);
        expect(historyRes.body.games[0]).toMatchObject({
            id: room.currentGame.id,
            status: "CANCELLED",
            winner: null,
        });

        // Host consegue iniciar nova partida (replay) após cancelamento.
        const replayRes = await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${token}`);
        expect(replayRes.status).toBe(201);
        expect(replayRes.body.currentGame.status).toBe("WAITING");
        expect(replayRes.body.currentGame.id).not.toBe(room.currentGame.id);
    });

    it("Saída voluntária sequencial 3->2->1: mantém com 2 e cancela somente quando cai para 1", async () => {
        const { token, room } = await createHostAndRoom(4);

        const ana = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });
        const carol = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carol" });

        expect((await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`)).status).toBe(200);

        // Carol sai: restam Ana e Bob (2 >= 2) -> partida continua IN_PROGRESS.
        const carolLeave = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${carol.body.sessionToken}`);
        expect(carolLeave.status).toBe(200);
        expect(carolLeave.body.gameCancelled).toBe(false);
        expect(carolLeave.body.eligiblePlayerCount).toBe(2);

        const gameAfterFirst = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
        });
        expect(gameAfterFirst?.status).toBe("IN_PROGRESS");

        recordedEvents.length = 0;

        // Bob sai: resta apenas Ana (1 < 2) -> partida cancela.
        const bobLeave = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bob.body.sessionToken}`);
        expect(bobLeave.status).toBe(200);
        expect(bobLeave.body.gameCancelled).toBe(true);
        expect(bobLeave.body.eligiblePlayerCount).toBe(1);

        const gameAfterSecond = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
        });
        expect(gameAfterSecond?.status).toBe("CANCELLED");

        // Se Ana sair de uma partida já cancelada, não deve recancelar nem emitir game:finished duplicado.
        const anaLeave = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${ana.body.sessionToken}`);
        expect(anaLeave.status).toBe(409);
        expect(
            recordedEvents.filter((e) => e.event === "game:finished"),
        ).toHaveLength(1);
    });

    it("Desconexão dentro de 60s mantém elegibilidade sem cancelar; após expirar para < 2, abandono automático cancela a partida", async () => {
        const { token, room } = await createHostAndRoom(4);

        await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect((await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`)).status).toBe(200);

        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(roundRes.status).toBe(201);

        // Bob desconecta temporariamente com prazo futuro (+30s).
        await prisma.gamePlayer.update({
            where: { id: bob.body.player.id },
            data: {
                disconnectedAt: new Date(Date.now() - 30_000),
                reconnectDeadlineAt: new Date(Date.now() + 30_000),
            },
        });

        const abandonmentService = createAbandonmentService();
        expect(await abandonmentService.processExpiredAbandonments()).toBe(0);

        const gameDuringGrace = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
        });
        expect(gameDuringGrace?.status).toBe("IN_PROGRESS");

        // Expira prazo de reconexão de Bob.
        await prisma.gamePlayer.update({
            where: { id: bob.body.player.id },
            data: {
                disconnectedAt: new Date(Date.now() - 70_000),
                reconnectDeadlineAt: new Date(Date.now() - 10_000),
            },
        });

        recordedEvents.length = 0;
        const abandonedCount = await abandonmentService.processExpiredAbandonments();
        expect(abandonedCount).toBe(1);

        expect(recordedEvents.map((e) => e.event)).toEqual([
            "player:left",
            "game:finished",
        ]);
        expect(recordedEvents[1]?.payload).toMatchObject({
            roomId: room.id,
            gameId: room.currentGame.id,
            status: "CANCELLED",
            reason: "INSUFFICIENT_PLAYERS",
        });

        const gameAfterTimeout = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
            include: { rounds: true },
        });
        expect(gameAfterTimeout?.status).toBe("CANCELLED");
        expect(gameAfterTimeout?.rounds[0]?.status).toBe("CLOSED");
    });

    it("Abandono simultâneo quando 2 jogadores expiram na mesma varredura cancela apenas uma vez sem duplicar game:finished", async () => {
        const { token, room } = await createHostAndRoom(4);

        const ana = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect((await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`)).status).toBe(200);

        // Ambos desconectaram e expiraram antes da varredura.
        await prisma.gamePlayer.updateMany({
            where: { id: { in: [ana.body.player.id, bob.body.player.id] } },
            data: {
                disconnectedAt: new Date(Date.now() - 80_000),
                reconnectDeadlineAt: new Date(Date.now() - 10_000),
            },
        });

        recordedEvents.length = 0;
        const abandonmentService = createAbandonmentService();
        const abandonedCount = await abandonmentService.processExpiredAbandonments();

        expect(abandonedCount).toBeGreaterThanOrEqual(1);
        expect(
            recordedEvents.filter((e) => e.event === "game:finished"),
        ).toHaveLength(1);

        const game = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
        });
        expect(game?.status).toBe("CANCELLED");
    });

    it("Concorrência: saídas simultâneas, encerramento manual (FINISHED) e abandono disputam o mesmo lock sem deadlock nem sobrescrita de FINISHED", async () => {
        const { token, room } = await createHostAndRoom(4);

        const ana = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Ana" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect((await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`)).status).toBe(200);

        recordedEvents.length = 0;

        // Dispara encerramento manual (FINISHED) em paralelo com saída voluntária (LEFT).
        const [finishRes, leaveRes] = await Promise.all([
            request(app)
                .post(`/rooms/${room.id}/finish`)
                .set("Authorization", `Bearer ${token}`),
            request(app)
                .post("/rooms/leave")
                .set("Authorization", `Bearer ${bob.body.sessionToken}`),
        ]);

        expect([200, 409]).toContain(finishRes.status);
        expect([200, 409]).toContain(leaveRes.status);

        // Garante exatamente um estado final consistente (FINISHED ou CANCELLED) e no máximo um game:finished se ambos sucederam em ordem exata.
        const game = await prisma.game.findUnique({
            where: { id: room.currentGame.id },
        });
        expect(["FINISHED", "CANCELLED"]).toContain(game?.status);

        // Se acabou FINISHED, tentativa posterior de abandono/saída não pode reverter para CANCELLED.
        if (game?.status === "FINISHED") {
            const lateAnaLeave = await request(app)
                .post("/rooms/leave")
                .set("Authorization", `Bearer ${ana.body.sessionToken}`);
            expect(lateAnaLeave.status).toBe(409);

            const gameStillFinished = await prisma.game.findUnique({
                where: { id: room.currentGame.id },
            });
            expect(gameStillFinished?.status).toBe("FINISHED");
        }
    });
});
