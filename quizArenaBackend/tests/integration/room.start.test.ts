
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

const password = "12345678";
const hostEmail = "room.start.host@email.com";
const otherEmail = "room.start.other@email.com";

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

async function createPlayers(
    roomId: string,
    quantity: number,
): Promise<void> {
    const game = await prisma.game.findFirstOrThrow({
        where: { roomId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    await prisma.gamePlayer.createMany({
        data: Array.from({ length: quantity }, (_, index) => ({
            gameId: game.id,
            nickname: `Jogador ${index + 1}`,
        })),
    });
}

async function createQuestions(
    roomId: string,
    token: string,
    quantity: number,
): Promise<void> {
    for (let index = 0; index < quantity; index++) {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${token}`)
            .send({
                roomId,
                statement: `Pergunta de teste ${index + 1}`,
                type: "MULTIPLE_CHOICE",
                options: [
                    { text: "Alternativa 1", isCorrect: true },
                    { text: "Alternativa 2", isCorrect: false },
                    { text: "Alternativa 3", isCorrect: false },
                    { text: "Alternativa 4", isCorrect: false },
                ],
            });

        expect(response.status).toBe(201);
    }
}

async function deactivateOneQuestion(roomId: string): Promise<void> {
    const question = await prisma.question.findFirstOrThrow({
        where: { roomId },
    });

    await prisma.question.update({
        where: { id: question.id },
        data: { isActive: false },
    });
}

describe("POST /rooms/:id/start - Integração", () => {
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

    it("deve retornar 401 quando não houver autenticação", async () => {
        const { room } = await createRoom();

        const response = await request(app)
            .post(`/rooms/${room.id}/start`);

        expect(response.status).toBe(401);

        const persistedGame = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(persistedGame?.status).toBe("WAITING");
    });

    it("deve iniciar a partida e persistir o snapshot do deck", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, token, 5);

        const originalQuestions = await prisma.question.findMany({
            where: { roomId: room.id },
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
            orderBy: [
                { createdAt: "asc" },
                { id: "asc" },
            ],
        });

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("IN_PROGRESS");

        const persistedRoom = await prisma.room.findUnique({
            where: { id: room.id },
        });

        expect(persistedRoom?.status).toBe("ACTIVE");

        const game = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(game).not.toBeNull();
        expect(game?.roomId).toBe(room.id);
        expect(game?.status).toBe("IN_PROGRESS");
        expect(game?.startedAt).toBeInstanceOf(Date);
        expect(game?.finishedAt).toBeNull();

        const snapshot = await prisma.roomQuestionSnapshot.findUnique({
            where: { gameId: game!.id },
            include: {
                questions: {
                    orderBy: { position: "asc" },
                    include: {
                        options: {
                            orderBy: { position: "asc" },
                        },
                    },
                },
            },
        });

        expect(snapshot).not.toBeNull();
        expect(snapshot?.questions).toHaveLength(5);

        for (const [index, snapshotQuestion] of (
            snapshot?.questions ?? []
        ).entries()) {
            const originalQuestion = originalQuestions[index];

            expect(snapshotQuestion.sourceQuestionId).toBe(
                originalQuestion.id,
            );
            expect(snapshotQuestion.statement).toBe(
                originalQuestion.statement,
            );
            expect(snapshotQuestion.type).toBe(originalQuestion.type);
            expect(snapshotQuestion.position).toBe(index);

            expect(snapshotQuestion.options).toHaveLength(4);

            for (const [optionIndex, snapshotOption] of (
                snapshotQuestion.options
            ).entries()) {
                const originalOption = originalQuestion.options[optionIndex];

                expect(snapshotOption.sourceOptionId).toBe(
                    originalOption.id,
                );
                expect(snapshotOption.text).toBe(originalOption.text);
                expect(snapshotOption.isCorrect).toBe(
                    originalOption.isCorrect,
                );
                expect(snapshotOption.position).toBe(optionIndex);
            }
        }

        // Altera as perguntas originais depois do início.
        await prisma.question.updateMany({
            where: { roomId: room.id },
            data: {
                statement: "Pergunta modificada após o início",
                isActive: false,
            },
        });

        await prisma.question.delete({
            where: { id: originalQuestions[0].id },
        });

        const snapshotAfterChanges =
            await prisma.roomQuestionSnapshot.findUnique({
                where: { gameId: game!.id },
                include: {
                    questions: {
                        orderBy: { position: "asc" },
                        include: {
                            options: {
                                orderBy: { position: "asc" },
                            },
                        },
                    },
                },
            });

        expect(snapshotAfterChanges?.questions).toHaveLength(5);

        expect(
            snapshotAfterChanges?.questions.some(
                (question) =>
                    question.sourceQuestionId === originalQuestions[0].id,
            ),
        ).toBe(true);

        for (const snapshotQuestion of (
            snapshotAfterChanges?.questions ?? []
        )) {
            expect(snapshotQuestion.statement).not.toBe(
                "Pergunta modificada após o início",
            );
        }
    });

    it("não deve permitir que outro usuário inicie a partida", async () => {
        const { room } = await createRoom();
        const otherToken = await createOtherUser();

        await createPlayers(room.id, 2);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${otherToken}`);

        expect(response.status).toBe(403);

        const persistedGame = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(persistedGame?.status).toBe("WAITING");
    });

    it("não deve iniciar quando faltarem jogadores E perguntas, informando ambos os requisitos", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 1);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("START_REQUIREMENTS_NOT_MET");
        expect(response.body.message).toMatch(/2 jogadores ativos.*5 perguntas ativas/i);
        expect(response.body.requirements).toEqual({
            currentPlayers: 1,
            requiredPlayers: 2,
            currentQuestions: 0,
            requiredQuestions: 5,
            missingPlayers: true,
            missingQuestions: true,
        });

        const persistedGame = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(persistedGame?.status).toBe("WAITING");
    });

    it("não deve iniciar com menos de 2 jogadores mesmo com perguntas suficientes", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 1);
        await createQuestions(room.id, token, 5);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("NOT_ENOUGH_PLAYERS");
        expect(response.body.message).toBe(
            "São necessários pelo menos 2 jogadores ativos para iniciar a partida (atual: 1).",
        );
        expect(response.body.requirements).toEqual({
            currentPlayers: 1,
            requiredPlayers: 2,
            currentQuestions: 5,
            requiredQuestions: 5,
            missingPlayers: true,
            missingQuestions: false,
        });
    });

    it("não deve iniciar com menos de 5 perguntas ativas", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, token, 4);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("NOT_ENOUGH_QUESTIONS");
        expect(response.body.message).toBe(
            "São necessárias pelo menos 5 perguntas ativas para iniciar a partida (atual: 4).",
        );
        expect(response.body.requirements).toEqual({
            currentPlayers: 2,
            requiredPlayers: 2,
            currentQuestions: 4,
            requiredQuestions: 5,
            missingPlayers: false,
            missingQuestions: true,
        });

        const snapshot = await prisma.roomQuestionSnapshot.findFirst({
            where: { game: { roomId: room.id } },
        });

        expect(snapshot).toBeNull();

        const persistedGame = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(persistedGame?.status).toBe("WAITING");
    });

    it("não deve considerar perguntas inativas na contagem", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, token, 5);
        await deactivateOneQuestion(room.id);

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);

        const persistedGame = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(persistedGame?.status).toBe("WAITING");
    });

    it("não deve iniciar uma sala que já foi iniciada", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);

        await prisma.game.updateMany({
            where: { roomId: room.id },
            data: { status: "IN_PROGRESS" },
        });

        const response = await request(app)
            .post(`/rooms/${room.id}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(409);
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const { token } = await createRoom();

        const response = await request(app)
            .post(`/rooms/${randomUUID()}/start`)
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });

    it("deve permitir apenas uma inicialização em chamadas simultâneas", async () => {
        const { room, token } = await createRoom();

        await createPlayers(room.id, 2);
        await createQuestions(room.id, token, 5);

        const startRequests = Array.from({ length: 2 }, () =>
            request(app)
                .post(`/rooms/${room.id}/start`)
                .set("Authorization", `Bearer ${token}`),
        );

        const responses = await Promise.all(startRequests);

        const successfulResponses = responses.filter(
            (response) => response.status === 200,
        );

        const rejectedResponses = responses.filter(
            (response) => response.status === 409,
        );

        expect(successfulResponses).toHaveLength(1);
        expect(rejectedResponses).toHaveLength(1);

        const persistedGame = await prisma.game.findFirst({
            where: { roomId: room.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        expect(persistedGame?.status).toBe("IN_PROGRESS");

        const snapshotCount = await prisma.roomQuestionSnapshot.count({
            where: { game: { roomId: room.id } },
        });

        expect(snapshotCount).toBe(1);

        const gameCount = await prisma.game.count({
            where: { roomId: room.id },
        });

        expect(gameCount).toBe(1);
    });
});
