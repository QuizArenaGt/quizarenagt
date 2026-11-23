import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { validRoomQuestions } from "../helpers/room-test-data.js";

const password = "12345678";
const hostEmail = "room.games.history.host@email.com";
const otherEmail = "room.games.history.other@email.com";

async function cleanTestData(): Promise<void> {
    const users = await prisma.user.findMany({
        where: { email: { in: [hostEmail, otherEmail] } },
        select: { id: true },
    });

    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
        await prisma.room.deleteMany({
            where: { hostId: { in: userIds } },
        });
    }

    await prisma.user.deleteMany({
        where: { id: { in: userIds } },
    });
}

async function createHostAndRoom(email = hostEmail) {
    const host = await prisma.user.create({
        data: {
            name: "Host Histórico",
            email,
            password: await hash(password, 12),
        },
    });

    const login = await request(app)
        .post("/auth/login")
        .send({ email, password });
    const token = login.body.token as string;

    const roomRes = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Sala Histórico",
            theme: "História",
            maxPlayers: 10,
            questionTime: 30,
            gameMode: "CLASSIC",
        });

    expect(roomRes.status).toBe(201);
    const room = roomRes.body;

    const createdQuestions: Array<{ id: string; statement: string }> = [];
    for (const q of validRoomQuestions(5)) {
        const qRes = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${token}`)
            .send({ roomId: room.id, ...q });
        expect(qRes.status).toBe(201);
        createdQuestions.push(qRes.body as { id: string; statement: string });
    }

    return { host, token, room, questions: createdQuestions };
}

describe("GET /rooms/:id/games & GET /rooms/:id/games/:gameId/results - Integração", () => {
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

    it("deve retornar lista vazia quando a sala não possuir partidas e exigir autenticação/autorização do host", async () => {
        const { token, room } = await createHostAndRoom(hostEmail);
        const other = await createHostAndRoom(otherEmail);

        await prisma.game.deleteMany({ where: { roomId: room.id } });

        const unauth = await request(app).get(`/rooms/${room.id}/games`);
        expect(unauth.status).toBe(401);

        const forbidden = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${other.token}`);
        expect(forbidden.status).toBe(403);

        const notFound = await request(app)
            .get(`/rooms/${randomUUID()}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(notFound.status).toBe(404);

        const emptyRes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(emptyRes.status).toBe(200);
        expect(emptyRes.body.games).toEqual([]);
    });

    it("deve retornar histórico em ordem cronológica decrescente após replay, isolar partidas, calcular duração e preservar snapshots após edições", async () => {
        const { token, room } = await createHostAndRoom(hostEmail);
        const other = await createHostAndRoom(otherEmail);

        // Partida 1: Alice acerta a 1ª rodada, Bob erra; depois finaliza todas as 5 rodadas
        const g1Alice = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const g1Bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        const game1Id = g1Alice.body.player.gameId as string;

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
            const correctOpt = roundRes.body.round.question.options[0].id as string;
            const wrongOpt = roundRes.body.round.question.options[1].id as string;

            if (i === 0) {
                const aRes = await request(app)
                    .post(`/rounds/${roundId}/answer`)
                    .set("Authorization", `Bearer ${g1Alice.body.sessionToken}`)
                    .send({ optionId: correctOpt });
                expect(aRes.status).toBe(201);

                const bRes = await request(app)
                    .post(`/rounds/${roundId}/answer`)
                    .set("Authorization", `Bearer ${g1Bob.body.sessionToken}`)
                    .send({ optionId: wrongOpt });
                expect(bRes.status).toBe(201);
            }

            await prisma.round.update({
                where: { id: roundId },
                data: { status: "CLOSED", closedAt: new Date() },
            });
        }

        const finish1 = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(finish1.status).toBe(200);
        expect(finish1.body.finished).toBe(true);

        // Alterar configs e excluir/editar perguntas originais não pode afetar o resultado histórico do Game 1
        await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ gameMode: "HARDCORE", questionTime: 60 });

        const roomQuestions = await prisma.question.findMany({
            where: { roomId: room.id },
        });
        await request(app)
            .put(`/questions/${roomQuestions[0]!.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                statement: "Pergunta editada depois da Partida 1",
                options: [
                    { text: "Nova A", isCorrect: true },
                    { text: "Nova B", isCorrect: false },
                ],
            });

        // Replay -> Partida 2 em WAITING com outros jogadores (Carlos)
        const playAgainRes = await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${token}`);
        expect(playAgainRes.status).toBe(201);
        const game2Id = playAgainRes.body.currentGame.id as string;

        await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carlos" });

        // Consulta histórico da sala
        const historyRes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(historyRes.status).toBe(200);

        const games = historyRes.body.games;
        expect(games).toHaveLength(2);

        // Ordem decrescente: Game 2 primeiro, Game 1 depois
        expect(games[0].id).toBe(game2Id);
        expect(games[0].status).toBe("WAITING");
        expect(games[0].durationMs).toBeNull();
        expect(games[0].playerCount).toBe(1);
        expect(games[0].winner).toBeNull();
        expect(games[0].ranking.map((p: { nickname: string }) => p.nickname)).toEqual(["Carlos"]);

        expect(games[1].id).toBe(game1Id);
        expect(games[1].status).toBe("FINISHED");
        expect(games[1].gameMode).toBe("CLASSIC");
        expect(games[1].questionTime).toBe(30);
        expect(games[1].durationMs).toEqual(expect.any(Number));
        expect(games[1].playerCount).toBe(2);
        expect(games[1].winner.nickname).toBe("Alice");
        expect(games[1].winner.score).toBeGreaterThanOrEqual(100);
        expect(games[1].ranking.map((p: { nickname: string }) => p.nickname)).toEqual(["Alice", "Bob"]);

        // Consulta detalhada dos resultados da Partida 1
        const detailsRes = await request(app)
            .get(`/rooms/${room.id}/games/${game1Id}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(detailsRes.status).toBe(200);
        expect(detailsRes.body.game.id).toBe(game1Id);
        expect(detailsRes.body.game.questionCount).toBe(5);
        expect(detailsRes.body.game.questions[0].statement).toBe("Pergunta de teste 1");
        expect(detailsRes.body.game.questions[0].answeredCount).toBe(2);
        expect(detailsRes.body.game.questions[0].correctCount).toBe(1);
        expect(detailsRes.body.game.ranking.map((p: { nickname: string }) => p.nickname)).toEqual([
            "Alice",
            "Bob",
        ]);

        // Isolamento entre salas: tentar consultar game1Id pela rota da sala de outro host (ou outra sala) falha
        const crossRoomRes = await request(app)
            .get(`/rooms/${other.room.id}/games/${game1Id}/results`)
            .set("Authorization", `Bearer ${other.token}`);
        expect(crossRoomRes.status).toBe(404);
    });

    it("deve retornar corretamente resultados de partida cancelada ou incompleta sem calcular vencedor", async () => {
        const { token, room } = await createHostAndRoom(hostEmail);

        const pJoin = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Marina" });
        const gameId = pJoin.body.player.gameId as string;

        await prisma.game.update({
            where: { id: gameId },
            data: {
                status: "CANCELLED",
                startedAt: new Date("2026-11-18T10:00:00.000Z"),
                finishedAt: null,
            },
        });

        const listRes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(listRes.status).toBe(200);
        expect(listRes.body.games).toHaveLength(1);
        expect(listRes.body.games[0].status).toBe("CANCELLED");
        expect(listRes.body.games[0].winner).toBeNull();
        expect(listRes.body.games[0].durationMs).toBeNull();
        expect(listRes.body.games[0].playerCount).toBe(1);

        const detailRes = await request(app)
            .get(`/rooms/${room.id}/games/${gameId}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(detailRes.status).toBe(200);
        expect(detailRes.body.game.status).toBe("CANCELLED");
        expect(detailRes.body.game.winner).toBeNull();
        expect(detailRes.body.game.ranking).toHaveLength(1);
    });

    it("deve preservar os enunciados históricos do snapshot mesmo após editar ou excluir as perguntas originais do banco", async () => {
        const { token, room, questions } = await createHostAndRoom(hostEmail);

        const p1Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Clara" });
        const p2Join = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Davi" });
        const p1Token = p1Join.body.sessionToken as string;
        const gameId = p1Join.body.player.gameId as string;

        const startRes = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);
        expect(startRes.status).toBe(200);

        const round1Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        expect(round1Res.status).toBe(201);
        const round1Id = round1Res.body.round.id as string;

        const lobbyP1 = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${p1Token}`);
        const firstCorrectOpt = lobbyP1.body.room.currentGame.activeRound.question.options[0].id as string;
        await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${p1Token}`)
            .send({ optionId: firstCorrectOpt });

        await request(app)
            .post(`/rounds/${round1Id}/close`)
            .set("Authorization", `Bearer ${token}`);

        await request(app)
            .post(`/rooms/${room.id}/finish`)
            .set("Authorization", `Bearer ${token}`);

        // Inicia replay para tornar a sala WAITING novamente e altera/remove a pergunta original do banco
        await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${token}`);

        expect(p2Join.status).toBe(201);

        const editedOriginalQuestion = questions[0]!;
        const deletedOriginalQuestion = questions[1]!;

        const updateRes = await request(app)
            .put(`/questions/${editedOriginalQuestion.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                statement: "Enunciado editado após a partida",
                options: [
                    { text: "Nova opção A", isCorrect: true },
                    { text: "Nova opção B", isCorrect: false },
                ],
            });
        expect(updateRes.status).toBe(200);

        const deleteRes = await request(app)
            .delete(`/questions/${deletedOriginalQuestion.id}`)
            .set("Authorization", `Bearer ${token}`);
        expect([200, 204]).toContain(deleteRes.status);

        // Relatório da partida encerrada continua exibindo exatamente o enunciado do snapshot
        const resultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${gameId}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(resultsRes.status).toBe(200);
        expect(resultsRes.body.game.questions).toHaveLength(1);
        expect(resultsRes.body.game.questions[0].statement).toBe("Pergunta de teste 1");
    });

    it("deve calcular estatísticas agregadas por sala (excluindo CANCELLED/IN_PROGRESS/WAITING), isolar salas e expor contadores em GET /rooms", async () => {
        const { token, room, questions } = await createHostAndRoom(hostEmail);

        // Cria uma segunda sala do mesmo host para garantir isolamento estrito por sala
        const roomBRes = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Sala Isolada B",
                theme: "Ciência",
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "HARDCORE",
            });
        expect(roomBRes.status).toBe(201);
        const roomB = roomBRes.body as { id: string; code: string };

        // Partida 1 na Sala A (FINISHED, 2 jogadores, 1 rodada com 1 acerto e 1 erro)
        const g1P1 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "Ana" });
        const g1P2 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "Bruno" });
        const g1Id = g1P1.body.player.gameId as string;

        await request(app).post(`/rooms/${room.id}/start`).set("Authorization", `Bearer ${token}`);
        const g1RoundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const g1RoundId = g1RoundRes.body.round.id as string;
        const g1CorrectOpt = g1RoundRes.body.round.question.options[0].id as string;
        const g1WrongOpt = g1RoundRes.body.round.question.options[1].id as string;

        await request(app)
            .post(`/rounds/${g1RoundId}/answer`)
            .set("Authorization", `Bearer ${g1P1.body.sessionToken as string}`)
            .send({ optionId: g1CorrectOpt });
        await request(app)
            .post(`/rounds/${g1RoundId}/answer`)
            .set("Authorization", `Bearer ${g1P2.body.sessionToken as string}`)
            .send({ optionId: g1WrongOpt });
        await request(app).post(`/rooms/${room.id}/finish`).set("Authorization", `Bearer ${token}`);

        // Replay -> Partida 2 na Sala A (CANCELLED após saída voluntária — não deve contaminar stats)
        await request(app).post(`/rooms/${room.id}/play-again`).set("Authorization", `Bearer ${token}`);
        const cP1 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "C1" });
        const cP2 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "C2" });
        await request(app).post(`/rooms/${room.id}/start`).set("Authorization", `Bearer ${token}`);
        await request(app).post("/rooms/leave").set("Authorization", `Bearer ${cP1.body.sessionToken as string}`);
        await request(app).post("/rooms/leave").set("Authorization", `Bearer ${cP2.body.sessionToken as string}`);

        // Replay -> Partida 3 na Sala A (FINISHED, 3 jogadores, 1 rodada com 3 acertos)
        await request(app).post(`/rooms/${room.id}/play-again`).set("Authorization", `Bearer ${token}`);
        const g3P1 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "Ana" });
        const g3P2 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "Carla" });
        const g3P3 = await request(app).post("/rooms/join").send({ code: room.code, nickname: "Davi" });

        await request(app).post(`/rooms/${room.id}/start`).set("Authorization", `Bearer ${token}`);
        const g3RoundRes = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${token}`);
        const g3RoundId = g3RoundRes.body.round.id as string;
        const g3CorrectOpt = g3RoundRes.body.round.question.options[0].id as string;

        for (const pTok of [g3P1.body.sessionToken, g3P2.body.sessionToken, g3P3.body.sessionToken]) {
            await request(app)
                .post(`/rounds/${g3RoundId}/answer`)
                .set("Authorization", `Bearer ${pTok as string}`)
                .send({ optionId: g3CorrectOpt });
        }
        await request(app).post(`/rooms/${room.id}/finish`).set("Authorization", `Bearer ${token}`);

        // Inicia mais um replay em WAITING — partidas antigas e stats da Sala A continuam íntegros
        await request(app).post(`/rooms/${room.id}/play-again`).set("Authorization", `Bearer ${token}`);

        // GET /rooms traz resumo de questões, partidas finalizadas e última data por sala
        const hostRoomsRes = await request(app)
            .get("/rooms")
            .set("Authorization", `Bearer ${token}`);
        expect(hostRoomsRes.status).toBe(200);
        const listedA = hostRoomsRes.body.rooms.find((r: { id: string }) => r.id === room.id);
        const listedB = hostRoomsRes.body.rooms.find((r: { id: string }) => r.id === roomB.id);
        expect(listedA.activeQuestionsCount).toBe(questions.length);
        expect(listedA.finishedGamesCount).toBe(2);
        expect(typeof listedA.lastGameFinishedAt).toBe("string");
        expect(listedB.activeQuestionsCount).toBe(0);
        expect(listedB.finishedGamesCount).toBe(0);
        expect(listedB.lastGameFinishedAt).toBeNull();

        // GET /rooms/:id/games da Sala A retorna histórico (4 sessões) e agregados de 2 FINISHED apenas
        const gamesARes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(gamesARes.status).toBe(200);
        expect(gamesARes.body.games).toHaveLength(4);
        expect(gamesARes.body.stats.roomId).toBe(room.id);
        expect(gamesARes.body.stats.finishedGamesCount).toBe(2);
        expect(gamesARes.body.stats.totalParticipations).toBe(5);
        expect(gamesARes.body.stats.averagePlayersPerGame).toBeCloseTo(2.5, 5);
        expect(gamesARes.body.stats.totalAnswers).toBe(5);
        expect(gamesARes.body.stats.totalCorrectAnswers).toBe(4);
        expect(gamesARes.body.stats.averageCorrectRate).toBeCloseTo(0.8, 5);
        expect(gamesARes.body.stats.questionPerformance[0]?.gamesPlayedCount).toBe(2);

        // Relatório individual da Partida 1 continua acessível e isolado (2 jogadores, 50% de acerto)
        const g1Report = await request(app)
            .get(`/rooms/${room.id}/games/${g1Id}/results`)
            .set("Authorization", `Bearer ${token}`);
        expect(g1Report.status).toBe(200);
        expect(g1Report.body.game.playerCount).toBe(2);
        expect(g1Report.body.game.questions[0].answeredCount).toBe(2);
        expect(g1Report.body.game.questions[0].correctCount).toBe(1);

        // GET /rooms/:id/games da Sala B não é afetado pelos dados da Sala A
        const gamesBRes = await request(app)
            .get(`/rooms/${roomB.id}/games`)
            .set("Authorization", `Bearer ${token}`);
        expect(gamesBRes.status).toBe(200);
        expect(gamesBRes.body.stats.finishedGamesCount).toBe(0);
        expect(gamesBRes.body.stats.totalParticipations).toBe(0);
        expect(gamesBRes.body.stats.averageCorrectRate).toBeNull();
    });
});
