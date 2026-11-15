
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
import { QuestionType } from "@prisma/client";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";

describe("Fluxo completo de sala - Integração", () => {
    const email = "room.complete-flow@email.com";
    const password = "12345678";

    let userId: string;
    let token: string;

    beforeAll(async () => {
        await prisma.$connect();
    });

    beforeEach(async () => {
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            await prisma.room.deleteMany({
                where: { hostId: existingUser.id },
            });

            await prisma.user.delete({
                where: { id: existingUser.id },
            });
        }

        const user = await prisma.user.create({
            data: {
                name: "Host do Fluxo Completo",
                email,
                password: await hash(password, 12),
            },
        });

        userId = user.id;

        const loginResponse = await request(app)
            .post("/auth/login")
            .send({ email, password });

        expect(loginResponse.status).toBe(200);
        token = loginResponse.body.token;
    });

    afterAll(async () => {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (user) {
            await prisma.room.deleteMany({
                where: { hostId: user.id },
            });

            await prisma.user.delete({
                where: { id: user.id },
            });
        }

        await prisma.$disconnect();
    });

    it("deve criar, configurar e adicionar perguntas à sala", async () => {
        // 1. Criar sala
        const createResponse = await request(app)
            .post("/rooms")
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 10,
                questionTime: 30,
            });

        expect(createResponse.status).toBe(201);

        const roomId = createResponse.body.id;

        expect(createResponse.body).toMatchObject({
            hostId: userId,
            maxPlayers: 10,
            questionTime: 30,
            gameMode: "CLASSIC",
            status: "WAITING",
        });

        // 2. Atualizar configurações
        const updateResponse = await request(app)
            .patch(`/rooms/${roomId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                maxPlayers: 20,
                questionTime: 60,
                gameMode: "HARDCORE",
            });

        expect(updateResponse.status).toBe(200);

        expect(updateResponse.body).toMatchObject({
            id: roomId,
            hostId: userId,
            maxPlayers: 20,
            questionTime: 60,
            gameMode: "HARDCORE",
            status: "WAITING",
        });

        // 3. Criar pergunta vinculada à sala
        const questionPayload = {
            roomId,
            statement: "Qual é o maior planeta do Sistema Solar?",
            type: QuestionType.MULTIPLE_CHOICE,
            options: [
                { text: "Júpiter", isCorrect: true },
                { text: "Saturno", isCorrect: false },
                { text: "Marte", isCorrect: false },
                { text: "Terra", isCorrect: false },
            ],
        };

        const questionResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${token}`)
            .send(questionPayload);

        expect(questionResponse.status).toBe(201);

        expect(questionResponse.body).toMatchObject({
            roomId,
            statement: questionPayload.statement,
            type: QuestionType.MULTIPLE_CHOICE,
            isActive: true,
        });

        expect(questionResponse.body.options).toHaveLength(4);

        // 4. Conferir persistência no PostgreSQL
        const savedRoom = await prisma.room.findUnique({
            where: { id: roomId },
            include: {
                questions: {
                    include: {
                        options: true,
                    },
                },
            },
        });

        expect(savedRoom).not.toBeNull();

        expect(savedRoom).toMatchObject({
            id: roomId,
            hostId: userId,
            maxPlayers: 20,
            questionTime: 60,
            gameMode: "HARDCORE",
            status: "WAITING",
        });

        expect(savedRoom?.questions).toHaveLength(1);

        expect(savedRoom?.questions[0]).toMatchObject({
            roomId,
            statement: questionPayload.statement,
            type: QuestionType.MULTIPLE_CHOICE,
            isActive: true,
        });

        expect(savedRoom?.questions[0].options).toHaveLength(4);

        expect(
            savedRoom?.questions[0].options.filter(
                (option) => option.isCorrect,
            ),
        ).toHaveLength(1);
    });
});
