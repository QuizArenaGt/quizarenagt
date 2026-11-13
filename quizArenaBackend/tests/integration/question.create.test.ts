import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { QuestionType, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { JwtService } from "../../src/auth/jwt.service.js";

describe("POST /questions - Integração", () => {
    const jwtService = new JwtService();

    let adminToken: string;
    let roomId: string;
    let adminId: string;

    const userToken = jwtService.generate({
        id: "regular-user-id",
        role: Role.USER,
    });

    const hostToken = jwtService.generate({
        id: "host-user-id",
        role: Role.HOST,
    });

    const validQuestionPayload = {
        roomId: "",
        statement: "Qual é o maior planeta do Sistema Solar?",
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Júpiter", isCorrect: true },
            { text: "Saturno", isCorrect: false },
            { text: "Marte", isCorrect: false },
            { text: "Terra", isCorrect: false },
        ],
    };

    beforeAll(async () => {
        await prisma.$connect();

        const suffix = randomUUID();

        const admin = await prisma.user.create({
            data: {
                name: "Admin de Teste",
                email: `admin-${suffix}@test.com`,
                password: "test-password-hash",
                role: Role.ADMIN,
            },
        });

        adminId = admin.id;

        const room = await prisma.room.create({
            data: {
                code: `TEST-${suffix}`,
                hostId: admin.id,
                maxPlayers: 10,
                questionTime: 20,
            },
        });

        roomId = room.id;
        validQuestionPayload.roomId = room.id;

        adminToken = jwtService.generate({
            id: admin.id,
            role: Role.ADMIN,
        });
    });

    beforeEach(async () => {
        await prisma.question.deleteMany({
            where: { roomId },
        });
    });

    afterAll(async () => {
        if (roomId) {
            await prisma.room.delete({
                where: { id: roomId },
            });
        }

        if (adminId) {
            await prisma.user.delete({
                where: { id: adminId },
            });
        }

        await prisma.$disconnect();
    });

    it("deve criar uma pergunta com 4 alternativas quando autenticado como ADMIN (201)", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send(validQuestionPayload);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            id: expect.any(String),
            statement: validQuestionPayload.statement,
            type: QuestionType.MULTIPLE_CHOICE,
            isActive: true,
        });
        expect(response.body.options).toHaveLength(4);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: response.body.id },
            include: { options: true },
        });

        expect(savedQuestion).not.toBeNull();
        expect(savedQuestion?.statement).toBe(validQuestionPayload.statement);
        expect(savedQuestion?.options).toHaveLength(4);
        expect(
            savedQuestion?.options.filter((opt) => opt.isCorrect),
        ).toHaveLength(1);
        expect(
            savedQuestion?.options.find((opt) => opt.isCorrect)?.text,
        ).toBe("Júpiter");
    });

    it("deve retornar 403 quando autenticado com usuário comum (USER) ou HOST", async () => {
        const userResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${userToken}`)
            .send(validQuestionPayload);

        expect(userResponse.status).toBe(403);
        expect(userResponse.body).toHaveProperty("message");

        const hostResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validQuestionPayload);

        expect(hostResponse.status).toBe(403);
        expect(hostResponse.body).toHaveProperty("message");

        const count = await prisma.question.count({
            where: { roomId },
        });
        expect(count).toBe(0);
    });

    it("deve retornar 401 quando o token não for enviado ou for inválido", async () => {
        const noTokenResponse = await request(app)
            .post("/questions")
            .send(validQuestionPayload);

        expect(noTokenResponse.status).toBe(401);

        const invalidTokenResponse = await request(app)
            .post("/questions")
            .set("Authorization", "Bearer token-invalido")
            .send(validQuestionPayload);

        expect(invalidTokenResponse.status).toBe(401);
    });

    it("deve retornar 400 quando o enunciado for vazio", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...validQuestionPayload,
                statement: "   ",
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("statement");
    });

    it("deve retornar 400 quando o número de alternativas for diferente de 4", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...validQuestionPayload,
                options: validQuestionPayload.options.slice(0, 3),
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("options");
    });

    it("deve retornar 400 quando houver 0 ou mais de 1 alternativa correta", async () => {
        const zeroCorrectResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...validQuestionPayload,
                options: validQuestionPayload.options.map((opt) => ({
                    ...opt,
                    isCorrect: false,
                })),
            });

        expect(zeroCorrectResponse.status).toBe(400);
        expect(zeroCorrectResponse.body.errors).toHaveProperty("options");

        const twoCorrectResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...validQuestionPayload,
                options: validQuestionPayload.options.map((opt, index) => ({
                    ...opt,
                    isCorrect: index < 2,
                })),
            });

        expect(twoCorrectResponse.status).toBe(400);
        expect(twoCorrectResponse.body.errors).toHaveProperty("options");
    });
});
