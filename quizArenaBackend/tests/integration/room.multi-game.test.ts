import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { validRoomQuestions } from "../helpers/room-test-data.js";

const password = "12345678";
const hostEmail = "room.multigame.host@email.com";

async function cleanTestData(): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { email: hostEmail },
        select: { id: true },
    });

    if (user) {
        await prisma.room.deleteMany({
            where: { hostId: user.id },
        });
    }

    await prisma.user.deleteMany({
        where: { email: hostEmail },
    });
}

async function createHostAndRoom() {
    const host = await prisma.user.create({
        data: {
            name: "Host Multi-Game",
            email: hostEmail,
            password: await hash(password, 12),
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
            name: "Sala Persistente",
            theme: "Conhecimentos Gerais",
            maxPlayers: 10,
            questionTime: 30,
            gameMode: "CLASSIC",
        });

    expect(roomResponse.status).toBe(201);
    const room = roomResponse.body;

    const questions = validRoomQuestions(5);
    for (const q of questions) {
        const qRes = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${token}`)
            .send({
                roomId: room.id,
                ...q,
            });
        expect(qRes.status).toBe(201);
    }

    return { host, token, room };
}

describe("Room 1:N Game & Play Again - Integração", () => {
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

    it("deve preservar histórico integral da Partida 1 ao jogar novamente (Partida 2) e isolar tokens e pontuações", async () => {
        const { token, room } = await createHostAndRoom();

        // 1. Entrada dos jogadores na Partida 1
        const p1Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const p2Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect(p1Join.status).toBe(201);
        expect(p2Join.status).toBe(201);

        const game1Id = p1Join.body.player.gameId as string;
        const p1Game1Id = p1Join.body.player.id as string;
        const p1Game1Token = p1Join.body.sessionToken as string;

        // 2. Iniciar e jogar todas as 5 rodadas da Partida 1
        const start1 = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(start1.status).toBe(200);

        for (let i = 0; i < 5; i++) {
            const roundRes = await request(app)
                .post(`/rooms/${room.id}/rounds`)
                .set("Authorization", `Bearer ${token}`);
            expect(roundRes.status).toBe(201);

            const roundId = roundRes.body.round.id as string;
            const firstOptionId = roundRes.body.round.question.options[0].id as string;

            if (i === 0) {
                const ansRes = await request(app)
                    .post(`/rounds/${roundId}/answer`)
                    .set("Authorization", `Bearer ${p1Game1Token}`)
                    .send({ optionId: firstOptionId });
                expect(ansRes.status).toBe(201);
            }

            await prisma.round.update({
                where: { id: roundId },
                data: { status: "CLOSED", closedAt: new Date() },
            });
        }

        const finishRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(finishRes.status).toBe(200);
        expect(finishRes.body.finished).toBe(true);

        const p1AfterGame1 = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: p1Game1Id },
        });
        expect(p1AfterGame1.score).toBeGreaterThanOrEqual(100);

        // 3. Alterar configurações padrão da sala entre partidas não afeta Game #1
        const updateBetweenGames = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ gameMode: "HARDCORE", questionTime: 45 });
        expect(updateBetweenGames.status).toBe(200);
        expect(updateBetweenGames.body.gameMode).toBe("HARDCORE");
        expect(updateBetweenGames.body.questionTime).toBe(45);
        expect(updateBetweenGames.body.currentGame.gameMode).toBe("CLASSIC");
        expect(updateBetweenGames.body.currentGame.questionTime).toBe(30);

        const game1Persisted = await prisma.game.findUniqueOrThrow({
            where: { id: game1Id },
        });
        expect(game1Persisted.gameMode).toBe("CLASSIC");
        expect(game1Persisted.questionTime).toBe(30);
        expect(game1Persisted.status).toBe("FINISHED");

        // 4. Jogar novamente (criação de Game #2 WAITING)
        const playAgainRes = await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${token}`);
        expect(playAgainRes.status).toBe(201);
        expect(playAgainRes.body.status).toBe("WAITING");
        expect(playAgainRes.body.roomStatus).toBe("ACTIVE");
        expect(playAgainRes.body.players).toEqual([]);
        expect(playAgainRes.body.currentGame.id).not.toBe(game1Id);
        expect(playAgainRes.body.currentGame.gameMode).toBe("HARDCORE");
        expect(playAgainRes.body.currentGame.questionTime).toBe(45);

        const game2Id = playAgainRes.body.currentGame.id as string;

        // 5. Token da Partida 1 é rejeitado no lobby da Partida 2
        const oldTokenLobby = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${p1Game1Token}`);
        expect(oldTokenLobby.status).toBe(403);

        // 6. Mesmo nickname "Alice" pode entrar na Partida 2 com novo GamePlayer (score 0)
        const p1Game2Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const p2Game2Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carol" });

        expect(p1Game2Join.status).toBe(201);
        expect(p2Game2Join.status).toBe(201);
        expect(p1Game2Join.body.player.gameId).toBe(game2Id);
        expect(p1Game2Join.body.player.id).not.toBe(p1Game1Id);
        expect(p1Game2Join.body.player.score).toBe(0);

        // 7. Inicia Partida 2, cria Rodada 1 e bloqueia token da Partida 1 na resposta
        const start2 = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(start2.status).toBe(200);

        const g2Round1 = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(g2Round1.status).toBe(201);

        const g2Round1Id = g2Round1.body.round.id as string;
        const g2OptId = g2Round1.body.round.question.options[0].id as string;

        const oldTokenAnswerAttempt = await request(app)
            .post(`/rounds/${g2Round1Id}/answer`)
            .set("Authorization", `Bearer ${p1Game1Token}`)
            .send({ optionId: g2OptId });
        expect(oldTokenAnswerAttempt.status).toBe(401);

        // 8. Verificar que dados históricos do Game #1 permanecem intocados
        const game1Players = await prisma.gamePlayer.findMany({
            where: { gameId: game1Id },
        });
        expect(game1Players).toHaveLength(2);
        expect(
            game1Players.find((p) => p.id === p1Game1Id)?.score,
        ).toBe(p1AfterGame1.score);

        const game1Rounds = await prisma.round.count({
            where: { gameId: game1Id },
        });
        expect(game1Rounds).toBe(5);
    });

    it("deve permitir apenas uma criação em chamadas simultâneas a /play-again", async () => {
        const { token, room } = await createHostAndRoom();

        // Finaliza diretamente Game #1 para habilitar play-again
        await prisma.game.updateMany({
            where: { roomId: room.id },
            data: { status: "FINISHED", finishedAt: new Date() },
        });

        const responses = await Promise.all([
            request(app)
                .post(`/rooms/${room.id}/play-again`)
                .set("Authorization", `Bearer ${token}`),
            request(app)
                .post(`/rooms/${room.id}/play-again`)
                .set("Authorization", `Bearer ${token}`),
        ]);

        const created = responses.filter((r) => r.status === 201);
        const rejected = responses.filter((r) => r.status === 409);

        expect(created).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const gamesCount = await prisma.game.count({
            where: { roomId: room.id },
        });
        expect(gamesCount).toBe(2);
    });

    it("deve serializar submissões simultâneas de respostas na rodada sem duplicar resposta ou pontuação", async () => {
        const { token, room } = await createHostAndRoom();

        const p1Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const p2Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        expect(p1Join.status).toBe(201);
        expect(p2Join.status).toBe(201);

        const p1Id = p1Join.body.player.id as string;
        const p2Id = p2Join.body.player.id as string;
        const p1Token = p1Join.body.sessionToken as string;
        const p2Token = p2Join.body.sessionToken as string;

        const startRes = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startRes.status).toBe(200);

        const roundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(roundRes.status).toBe(201);

        const roundId = roundRes.body.round.id as string;
        const correctOptionId = roundRes.body.round.question.options[0].id as string;

        // Duas submissões simultâneas do mesmo jogador + submissão simultânea de outro jogador
        const [p1AttemptA, p1AttemptB, p2Attempt] = await Promise.all([
            request(app)
                .post(`/rounds/${roundId}/answer`)
                .set("Authorization", `Bearer ${p1Token}`)
                .send({ optionId: correctOptionId }),
            request(app)
                .post(`/rounds/${roundId}/answer`)
                .set("Authorization", `Bearer ${p1Token}`)
                .send({ optionId: correctOptionId }),
            request(app)
                .post(`/rounds/${roundId}/answer`)
                .set("Authorization", `Bearer ${p2Token}`)
                .send({ optionId: correctOptionId }),
        ]);

        const p1Statuses = [p1AttemptA.status, p1AttemptB.status].sort();
        expect(p1Statuses).toEqual([201, 409]);
        expect(p2Attempt.status).toBe(201);

        const [p1Db, p2Db, roundAnswersCount] = await Promise.all([
            prisma.gamePlayer.findUniqueOrThrow({ where: { id: p1Id } }),
            prisma.gamePlayer.findUniqueOrThrow({ where: { id: p2Id } }),
            prisma.roundAnswer.count({ where: { roundId } }),
        ]);

        expect(roundAnswersCount).toBe(2);
        expect(p1Db.score).toBeGreaterThanOrEqual(100);
        expect(p1Db.score).toBeLessThanOrEqual(200);
        expect(p2Db.score).toBeGreaterThanOrEqual(100);
        expect(p2Db.score).toBeLessThanOrEqual(200);
    });
});
