
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import request from "supertest";
import { GameStatus, QuestionType, Role, RoomStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { JwtService } from "../../src/auth/jwt.service.js";

describe("PUT /questions/:id - Integração", () => {
    const jwtService = new JwtService();

    let adminToken: string;
    let outsiderToken: string;

    let adminId: string;
    let outsiderId: string;

    let adminRoomId: string;
    let outsiderRoomId: string;

    const roomIds: string[] = [];
    const userIds: string[] = [];

    const validQuestionPayload = (roomId: string, statement = "Qual é a capital do Brasil?") => ({
        roomId,
        statement,
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Brasília", isCorrect: true },
            { text: "São Paulo", isCorrect: false },
            { text: "Rio de Janeiro", isCorrect: false },
            { text: "Salvador", isCorrect: false },
        ],
    });

    async function createQuestion(
        roomId: string,
        token: string,
        statement?: string,
    ) {
        return request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${token}`)
            .send(validQuestionPayload(roomId, statement));
    }

    async function updateQuestion(
        questionId: string,
        token: string,
        payload: object,
    ) {
        return request(app)
            .put(`/questions/${questionId}`)
            .set("Authorization", `Bearer ${token}`)
            .send(payload);
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
                    games: {
                        create: {
                            status: GameStatus.WAITING,
                            maxPlayers: 10,
                            questionTime: 20,
                        },
                    },
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

        await prisma.room.updateMany({
            where: {
                id: {
                    in: roomIds,
                },
            },
            data: {
                status: RoomStatus.ACTIVE,
            },
        });

        await prisma.game.updateMany({
            where: {
                roomId: {
                    in: roomIds,
                },
            },
            data: {
                status: GameStatus.WAITING,
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

    it("deve atualizar uma pergunta do próprio host (200)", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        expect(created.status).toBe(201);

        const payload = {
            ...validQuestionPayload(
                adminRoomId,
                "Qual é a capital da Alemanha?",
            ),
            options: [
                { text: "Berlim", isCorrect: true },
                { text: "Munique", isCorrect: false },
                { text: "Hamburgo", isCorrect: false },
            ],
        };

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            payload,
        );

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: created.body.id,
            roomId: adminRoomId,
            statement: "Qual é a capital da Alemanha?",
            type: QuestionType.MULTIPLE_CHOICE,
        });
        expect(response.body.options).toHaveLength(3);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
        });

        expect(savedQuestion).not.toBeNull();
        expect(savedQuestion?.statement).toBe(
            "Qual é a capital da Alemanha?",
        );
        expect(savedQuestion?.options).toHaveLength(3);
        expect(
            savedQuestion?.options.map((option) => option.text),
        ).toEqual(["Berlim", "Munique", "Hamburgo"]);
        expect(
            savedQuestion?.options.filter((option) => option.isCorrect),
        ).toHaveLength(1);
    });

    it("deve substituir as alternativas antigas pelas novas", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        expect(created.status).toBe(201);

        const payload = {
            ...validQuestionPayload(adminRoomId),
            options: [
                { text: "Alternativa X", isCorrect: false },
                { text: "Alternativa Y", isCorrect: true },
            ],
        };

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            payload,
        );

        expect(response.status).toBe(200);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
            include: {
                options: {
                    orderBy: { position: "asc" },
                },
            },
        });

        expect(savedQuestion?.options).toHaveLength(2);
        expect(
            savedQuestion?.options.map((option) => option.text),
        ).toEqual(["Alternativa X", "Alternativa Y"]);
        expect(
            savedQuestion?.options.some((option) =>
                ["Brasília", "São Paulo", "Rio de Janeiro", "Salvador"].includes(
                    option.text,
                ),
            ),
        ).toBe(false);
    });

    it("deve preservar a sala original mesmo quando outro roomId for enviado", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        expect(created.status).toBe(201);

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            validQuestionPayload(
                outsiderRoomId,
                "Pergunta atualizada",
            ),
        );

        expect(response.status).toBe(200);
        expect(response.body.roomId).toBe(adminRoomId);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
        });

        expect(savedQuestion?.roomId).toBe(adminRoomId);
    });

    it("deve retornar 403 quando outro usuário tentar atualizar a pergunta", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        const response = await updateQuestion(
            created.body.id,
            outsiderToken,
            validQuestionPayload(adminRoomId, "Tentativa de alteração"),
        );

        expect(response.status).toBe(403);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
        });

        expect(savedQuestion?.statement).toBe(
            "Qual é a capital do Brasil?",
        );
    });

    it("deve retornar 404 quando a pergunta não existir", async () => {
        const response = await updateQuestion(
            randomUUID(),
            adminToken,
            validQuestionPayload(adminRoomId),
        );

        expect(response.status).toBe(404);
    });

    it("deve retornar 409 quando a partida estiver em andamento", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        await prisma.game.updateMany({
            where: { roomId: adminRoomId },
            data: { status: GameStatus.IN_PROGRESS },
        });

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            validQuestionPayload(adminRoomId, "Tentativa de alteração"),
        );

        expect(response.status).toBe(409);
    });

    it("deve retornar 409 quando a sala estiver arquivada", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        await prisma.room.update({
            where: { id: adminRoomId },
            data: { status: RoomStatus.ARCHIVED },
        });

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            validQuestionPayload(adminRoomId, "Tentativa de alteração"),
        );

        expect(response.status).toBe(409);
    });

    it("deve retornar 400 quando o enunciado for vazio", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            {
                ...validQuestionPayload(adminRoomId),
                statement: "   ",
            },
        );

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Dados inválidos.");
        expect(response.body.errors).toHaveProperty("statement");
    });

    it("deve retornar 400 quando houver menos de 2 alternativas", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            {
                ...validQuestionPayload(adminRoomId),
                options: [
                    { text: "Única alternativa", isCorrect: true },
                ],
            },
        );

        expect(response.status).toBe(400);
        expect(response.body.errors).toHaveProperty("options");
    });

    it("deve retornar 400 quando não houver exatamente uma alternativa correta", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        const response = await updateQuestion(
            created.body.id,
            adminToken,
            {
                ...validQuestionPayload(adminRoomId),
                options: [
                    { text: "Alternativa A", isCorrect: false },
                    { text: "Alternativa B", isCorrect: false },
                ],
            },
        );

        expect(response.status).toBe(400);
        expect(response.body.errors).toHaveProperty("options");
    });

    it("deve retornar 401 quando não houver token", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        const response = await request(app)
            .put(`/questions/${created.body.id}`)
            .send(validQuestionPayload(adminRoomId));

        expect(response.status).toBe(401);
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        const created = await createQuestion(
            adminRoomId,
            adminToken,
        );

        const response = await request(app)
            .put(`/questions/${created.body.id}`)
            .set("Authorization", "Bearer token-invalido")
            .send(validQuestionPayload(adminRoomId));

        expect(response.status).toBe(401);
    });
});
