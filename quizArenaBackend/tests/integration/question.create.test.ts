
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
    let userToken: string;
    let hostToken: string;
    let outsiderToken: string;

    let adminId: string;
    let userId: string;
    let hostId: string;
    let outsiderId: string;

    let adminRoomId: string;
    let userRoomId: string;
    let hostRoomId: string;

    const roomIds: string[] = [];
    const userIds: string[] = [];

    const validQuestionPayload = (roomId: string) => ({
        roomId,
        statement: "Qual é o maior planeta do Sistema Solar?",
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Júpiter", isCorrect: true },
            { text: "Saturno", isCorrect: false },
            { text: "Marte", isCorrect: false },
            { text: "Terra", isCorrect: false },
        ],
    });

    beforeAll(async () => {
        await prisma.$connect();

        const suffix = randomUUID();

        async function createUser(name: string, role: Role) {
            const user = await prisma.user.create({
                data: {
                    name,
                    email: `${role.toLowerCase()}-${randomUUID()}@test.com`,
                    password: "test-password-hash",
                    role,
                },
            });

            userIds.push(user.id);
            return user;
        }

        async function createRoom(hostId: string, code: string) {
            const room = await prisma.room.create({
                data: {
                    code,
                    hostId,
                    maxPlayers: 10,
                    questionTime: 20,
                },
            });

            roomIds.push(room.id);
            return room;
        }

        const admin = await createUser("Admin de Teste", Role.ADMIN);
        const user = await createUser("Usuário de Teste", Role.USER);
        const host = await createUser("Host de Teste", Role.HOST);
        const outsider = await createUser("Outro Usuário", Role.USER);

        adminId = admin.id;
        userId = user.id;
        hostId = host.id;
        outsiderId = outsider.id;

        const adminRoom = await createRoom(adminId, `TEST-${suffix}-A`);
        const userRoom = await createRoom(userId, `TEST-${suffix}-U`);
        const hostRoom = await createRoom(hostId, `TEST-${suffix}-H`);

        adminRoomId = adminRoom.id;
        userRoomId = userRoom.id;
        hostRoomId = hostRoom.id;

        adminToken = jwtService.generate({
            id: adminId,
            role: Role.ADMIN,
        });

        userToken = jwtService.generate({
            id: userId,
            role: Role.USER,
        });

        hostToken = jwtService.generate({
            id: hostId,
            role: Role.HOST,
        });

        outsiderToken = jwtService.generate({
            id: outsiderId,
            role: Role.USER,
        });
    });

    beforeEach(async () => {
        await prisma.question.deleteMany({
            where: {
                roomId: {
                    in: roomIds,
                },
            },
        });
    });

    afterAll(async () => {
        if (roomIds.length > 0) {
            await prisma.room.deleteMany({
                where: {
                    id: {
                        in: roomIds,
                    },
                },
            });
        }

        if (userIds.length > 0) {
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: userIds,
                    },
                },
            });
        }

        await prisma.$disconnect();
    });

    it("deve permitir que ADMIN crie pergunta na própria sala (201)", async () => {
        const payload = validQuestionPayload(adminRoomId);

        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send(payload);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            id: expect.any(String),
            roomId: adminRoomId,
            statement: payload.statement,
            type: QuestionType.MULTIPLE_CHOICE,
            isActive: true,
        });
        expect(response.body.options).toHaveLength(4);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: response.body.id },
            include: { options: true },
        });

        expect(savedQuestion).not.toBeNull();
        expect(savedQuestion?.options).toHaveLength(4);
        expect(
            savedQuestion?.options.filter((option) => option.isCorrect),
        ).toHaveLength(1);
    });

    it("deve permitir que USER crie pergunta na própria sala (201)", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${userToken}`)
            .send(validQuestionPayload(userRoomId));

        expect(response.status).toBe(201);
        expect(response.body.roomId).toBe(userRoomId);
    });

    it("deve permitir que HOST crie pergunta na própria sala (201)", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validQuestionPayload(hostRoomId));

        expect(response.status).toBe(201);
        expect(response.body.roomId).toBe(hostRoomId);
    });

    it("deve retornar 403 quando outro usuário tentar criar pergunta na sala", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${outsiderToken}`)
            .send(validQuestionPayload(adminRoomId));

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message");

        const count = await prisma.question.count({
            where: { roomId: adminRoomId },
        });

        expect(count).toBe(0);
    });

    it("deve ignorar hostId enviado no body e utilizar o usuário autenticado", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${outsiderToken}`)
            .send({
                ...validQuestionPayload(adminRoomId),
                hostId: adminId,
            });

        expect(response.status).toBe(403);

        const count = await prisma.question.count({
            where: { roomId: adminRoomId },
        });

        expect(count).toBe(0);
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send(validQuestionPayload(randomUUID()));

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty(
            "message",
            "Sala não encontrada.",
        );
    });

    it("deve retornar 401 quando o token não for enviado ou for inválido", async () => {
        const payload = validQuestionPayload(adminRoomId);

        const noTokenResponse = await request(app)
            .post("/questions")
            .send(payload);

        expect(noTokenResponse.status).toBe(401);

        const invalidTokenResponse = await request(app)
            .post("/questions")
            .set("Authorization", "Bearer token-invalido")
            .send(payload);

        expect(invalidTokenResponse.status).toBe(401);
    });

    it("deve retornar 400 quando o enunciado for vazio", async () => {
        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...validQuestionPayload(adminRoomId),
                statement: "   ",
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("statement");
    });

    it("deve retornar 400 quando o número de alternativas for diferente de 4", async () => {
        const payload = validQuestionPayload(adminRoomId);

        const response = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...payload,
                options: payload.options.slice(0, 3),
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("options");
    });

    it("deve retornar 400 quando houver 0 ou mais de 1 alternativa correta", async () => {
        const payload = validQuestionPayload(adminRoomId);

        const zeroCorrectResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...payload,
                options: payload.options.map((option) => ({
                    ...option,
                    isCorrect: false,
                })),
            });

        expect(zeroCorrectResponse.status).toBe(400);
        expect(zeroCorrectResponse.body.errors).toHaveProperty("options");

        const twoCorrectResponse = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                ...payload,
                options: payload.options.map((option, index) => ({
                    ...option,
                    isCorrect: index < 2,
                })),
            });

        expect(twoCorrectResponse.status).toBe(400);
        expect(twoCorrectResponse.body.errors).toHaveProperty("options");
    });
});
