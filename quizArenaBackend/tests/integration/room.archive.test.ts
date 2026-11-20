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

const password = "12345678";
const hostEmail = "room.archive.host@email.com";
const otherEmail = "room.archive.other@email.com";

async function cleanTestData(): Promise<void> {
    const hosts = await prisma.user.findMany({
        where: { email: { in: [hostEmail, otherEmail] } },
        select: { id: true },
    });

    if (hosts.length > 0) {
        await prisma.room.deleteMany({
            where: { hostId: { in: hosts.map((h) => h.id) } },
        });
    }

    await prisma.user.deleteMany({
        where: { email: { in: [hostEmail, otherEmail] } },
    });
}

async function createHostAndOtherUser() {
    await prisma.user.createMany({
        data: [
            {
                name: "Host Archive",
                email: hostEmail,
                password: await hash(password, 10),
            },
            {
                name: "Outro Usuário",
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

    return {
        hostToken: hostLogin.body.token as string,
        otherToken: otherLogin.body.token as string,
    };
}

describe("DELETE /rooms/:id (Soft Delete / Arquivamento) - Integração", () => {
    beforeAll(async () => {
        await cleanTestData();
    });

    beforeEach(async () => {
        await cleanTestData();
    });

    afterAll(async () => {
        await cleanTestData();
        await prisma.$disconnect();
    });

    it("1, 2, 3, 4 e 6. deve arquivar sala sem apagar registros, ocultar da listagem ativa, bloquear novas entradas/partidas e preservar histórico e resultados", async () => {
        const { hostToken } = await createHostAndOtherUser();

        // Criar sala e adicionar 5 perguntas
        const roomRes = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${hostToken}`)
            .send({
                name: "Sala Arquivável",
                theme: "História",
                maxPlayers: 10,
                questionTime: 30,
            });
        expect(roomRes.status).toBe(201);
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
                                text: `Alt ${optIdx + 1}`,
                                isCorrect: optIdx === 0,
                                position: optIdx,
                            })),
                        },
                    },
                }),
            ),
        );

        // Jogadores entram, partida 1 acontece e finaliza
        const alice = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Alice" });
        const bob = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Bob" });

        const start1 = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(start1.status).toBe(200);
        const game1Id = start1.body.currentGame.id as string;

        const r1 = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        const round1Id = r1.body.round.id as string;
        const roundDb = await prisma.round.findUniqueOrThrow({ where: { id: round1Id } });
        const correctOpt = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: { questionSnapshotId: roundDb.snapshotQuestionId, isCorrect: true },
        });

        await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${alice.body.sessionToken}`)
            .send({ optionId: correctOpt.id });
        await request(app)
            .post(`/rounds/${round1Id}/answer`)
            .set("Authorization", `Bearer ${bob.body.sessionToken}`)
            .send({ optionId: correctOpt.id });

        // Marcar partida 1 como FINISHED e criar partida 2 (WAITING) para replay antes do arquivamento
        await prisma.game.update({
            where: { id: game1Id },
            data: { status: "FINISHED", finishedAt: new Date() },
        });
        const playAgainRes = await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(playAgainRes.status).toBe(201);

        // 1. Host arquiva sua própria sala via DELETE /rooms/:id
        const archiveRes = await request(app)
            .delete(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${hostToken}`);

        expect(archiveRes.status).toBe(200);
        expect(archiveRes.body.room.id).toBe(room.id);
        expect(archiveRes.body.room.roomStatus).toBe("ARCHIVED");
        expect(archiveRes.body.room.archivedAt).toBeTruthy();

        // Repetir DELETE é idempotente e preserva o archivedAt original
        const secondArchiveRes = await request(app)
            .delete(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(secondArchiveRes.status).toBe(200);
        expect(secondArchiveRes.body.room.archivedAt).toBe(archiveRes.body.room.archivedAt);

        // 2. Sala arquivada não aparece mais na listagem de salas ativas (GET /rooms -> F5)
        const listActiveRes = await request(app)
            .get("/rooms")
            .set("Authorization", `Bearer ${hostToken}`);
        expect(listActiveRes.status).toBe(200);
        expect(listActiveRes.body.rooms).toEqual([]);

        // 3. Sala arquivada não aceita novos jogadores nem disponibilidade
        const availRes = await request(app).get(`/rooms/${room.code}/availability`);
        expect(availRes.status).toBe(409);

        const joinAfterArchive = await request(app)
            .post("/rooms/join")
            .send({ code: room.code, nickname: "Carlos" });
        expect(joinAfterArchive.status).toBe(409);

        // 4. Sala arquivada não permite iniciar partidas, editar, replay ou abrir no lobby
        const startBlocked = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(startBlocked.status).toBe(409);

        const patchBlocked = await request(app)
            .patch(`/rooms/${room.id}`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send({ name: "Novo Nome" });
        expect(patchBlocked.status).toBe(409);

        const lobbyBlocked = await request(app)
            .get(`/rooms/${room.code}`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(lobbyBlocked.status).toBe(409);

        // Forçar replay quando jogo WAITING não existe também deve ser bloqueado por ROOM_ARCHIVED
        await prisma.game.updateMany({
            where: { roomId: room.id, status: "WAITING" },
            data: { status: "CANCELLED" },
        });
        const replayBlocked = await request(app)
            .post(`/rooms/${room.id}/play-again`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(replayBlocked.status).toBe(409);

        // 6. Histórico, games, jogadores, snapshots, rodadas e respostas seguem intactos no banco e na API
        const persistedRoom = await prisma.room.findUniqueOrThrow({
            where: { id: room.id },
            include: {
                games: {
                    include: {
                        players: true,
                        questionSnapshot: {
                            include: { questions: true },
                        },
                        rounds: {
                            include: { answers: true },
                        },
                    },
                },
            },
        });
        expect(persistedRoom.status).toBe("ARCHIVED");
        expect(persistedRoom.archivedAt).not.toBeNull();
        expect(persistedRoom.games).toHaveLength(2);

        const persistedGame1 = persistedRoom.games.find((g) => g.id === game1Id);
        expect(persistedGame1?.status).toBe("FINISHED");
        expect(persistedGame1?.players).toHaveLength(2);
        expect(persistedGame1?.questionSnapshot?.questions).toHaveLength(5);
        expect(persistedGame1?.rounds).toHaveLength(1);
        expect(persistedGame1?.rounds[0]?.answers).toHaveLength(2);

        const gamesHistoryRes = await request(app)
            .get(`/rooms/${room.id}/games`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(gamesHistoryRes.status).toBe(200);
        expect(gamesHistoryRes.body.games).toHaveLength(2);

        const gameResultsRes = await request(app)
            .get(`/rooms/${room.id}/games/${game1Id}/results`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(gameResultsRes.status).toBe(200);
        expect(gameResultsRes.body.game.ranking).toHaveLength(2);
        expect(gameResultsRes.body.game.questionCount).toBe(1);
        expect(gameResultsRes.body.game.questions).toHaveLength(1);
        expect(gameResultsRes.body.game.questions[0].answeredCount).toBe(2);
        expect(gameResultsRes.body.game.questions[0].correctCount).toBe(2);
    });

    it("5. usuário não autorizado (sem token ou de outro host) não consegue excluir a sala", async () => {
        const { hostToken, otherToken } = await createHostAndOtherUser();

        const roomRes = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${hostToken}`)
            .send({ maxPlayers: 8, questionTime: 25 });
        const roomId = roomRes.body.id as string;

        const unauthRes = await request(app).delete(`/rooms/${roomId}`);
        expect(unauthRes.status).toBe(401);

        const forbiddenRes = await request(app)
            .delete(`/rooms/${roomId}`)
            .set("Authorization", `Bearer ${otherToken}`);
        expect(forbiddenRes.status).toBe(403);

        const notFoundRes = await request(app)
            .delete("/rooms/sala-inexistente-uuid")
            .set("Authorization", `Bearer ${hostToken}`);
        expect(notFoundRes.status).toBe(404);

        const roomStillActive = await prisma.room.findUniqueOrThrow({
            where: { id: roomId },
        });
        expect(roomStillActive.status).toBe("ACTIVE");
        expect(roomStillActive.archivedAt).toBeNull();
    });
});
