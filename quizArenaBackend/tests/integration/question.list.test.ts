
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { QuestionType, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { JwtService } from "../../src/auth/jwt.service.js";

describe("GET /questions - Integração", () => {
    const jwtService = new JwtService();

    let adminToken: string;
    let outsiderToken: string;

    let adminId: string;
    let outsiderId: string;

    let adminRoomId: string;
    let outsiderRoomId: string;

    const roomIds: string[] = [];
    const userIds: string[] = [];

    const validQuestionPayload = (roomId: string, statement: string) => ({
        roomId,
        statement,
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Alternativa A", isCorrect: true },
            { text: "Alternativa B", isCorrect: false },
            { text: "Alternativa C", isCorrect: false },
            { text: "Alternativa D", isCorrect: false },
        ],
    });

    async function createQuestion(
        roomId: string,
        token: string,
        statement: string,
    ) {
        return request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${token}`)
            .send(validQuestionPayload(roomId, statement));
    }

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
        const outsider = await createUser("Outro Usuário", Role.USER);

        adminId = admin.id;
        outsiderId = outsider.id;

        const adminRoom = await createRoom(adminId, `TEST-${suffix}-A`);
        const outsiderRoom = await createRoom(
            outsiderId,
            `TEST-${suffix}-O`,
        );

        adminRoomId = adminRoom.id;
        outsiderRoomId = outsiderRoom.id;

        adminToken = jwtService.generate({
            id: adminId,
            role: Role.ADMIN,
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

    it("deve listar as perguntas da sala do próprio host (200)", async () => {
        const firstQuestion = await createQuestion(
            adminRoomId,
            adminToken,
            "Qual é o maior planeta?",
        );

        const secondQuestion = await createQuestion(
            adminRoomId,
            adminToken,
            "Qual é o menor planeta?",
        );

        expect(firstQuestion.status).toBe(201);
        expect(secondQuestion.status).toBe(201);

        const response = await request(app)
            .get("/questions")
            .query({ roomId: adminRoomId })
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);

        expect(
            response.body.every(
                (question: { roomId: string }) =>
                    question.roomId === adminRoomId,
            ),
        ).toBe(true);

        expect(
            response.body.map(
                (question: { statement: string }) => question.statement,
            ),
        ).toEqual(
            expect.arrayContaining([
                "Qual é o maior planeta?",
                "Qual é o menor planeta?",
            ]),
        );
    });

    it("deve retornar as alternativas ordenadas por posição", async () => {
        const createResponse = await createQuestion(
            adminRoomId,
            adminToken,
            "Qual é a capital do Brasil?",
        );

        expect(createResponse.status).toBe(201);

        const response = await request(app)
            .get("/questions")
            .query({ roomId: adminRoomId })
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);

        expect(
            response.body[0].options.map(
                (option: { text: string }) => option.text,
            ),
        ).toEqual([
            "Alternativa A",
            "Alternativa B",
            "Alternativa C",
            "Alternativa D",
        ]);
    });

    it("não deve listar perguntas de outras salas", async () => {
        await createQuestion(
            adminRoomId,
            adminToken,
            "Pergunta da sala do admin",
        );

        await createQuestion(
            outsiderRoomId,
            outsiderToken,
            "Pergunta da sala de outro usuário",
        );

        const response = await request(app)
            .get("/questions")
            .query({ roomId: adminRoomId })
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].statement).toBe(
            "Pergunta da sala do admin",
        );
        expect(response.body[0].roomId).toBe(adminRoomId);
    });

    it("deve retornar 403 quando outro usuário consultar a sala", async () => {
        const response = await request(app)
            .get("/questions")
            .query({ roomId: adminRoomId })
            .set("Authorization", `Bearer ${outsiderToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message");
    });

    it("deve retornar 404 quando a sala não existir", async () => {
        const response = await request(app)
            .get("/questions")
            .query({ roomId: randomUUID() })
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty(
            "message",
            "Sala não encontrada.",
        );
    });

    it("deve retornar 400 quando roomId não for informado", async () => {
        const response = await request(app)
            .get("/questions")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message");
    });

    it("deve retornar 400 quando roomId estiver vazio", async () => {
        const response = await request(app)
            .get("/questions")
            .query({ roomId: "   " })
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message");
    });

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app)
            .get("/questions")
            .query({ roomId: adminRoomId });

        expect(response.status).toBe(401);
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        const response = await request(app)
            .get("/questions")
            .query({ roomId: adminRoomId })
            .set("Authorization", "Bearer token-invalido");

        expect(response.status).toBe(401);
    });
});
