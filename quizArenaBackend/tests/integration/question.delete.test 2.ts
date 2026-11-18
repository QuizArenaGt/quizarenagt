
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import request from "supertest";
import { Role, RoomStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { JwtService } from "../../src/auth/jwt.service.js";

describe("DELETE /questions/:id - Integração", () => {
    const jwtService = new JwtService();

    let adminToken: string;
    let outsiderToken: string;

    let adminId: string;
    let outsiderId: string;

    let adminRoomId: string;

    const roomIds: string[] = [];
    const userIds: string[] = [];

    const validQuestionPayload = (roomId: string) => ({
        roomId,
        statement: "Qual é a capital do Brasil?",
        options: [
            { text: "Brasília", isCorrect: true },
            { text: "São Paulo", isCorrect: false },
            { text: "Rio de Janeiro", isCorrect: false },
            { text: "Salvador", isCorrect: false },
        ],
    });

    async function createQuestion(roomId: string) {
        return request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${adminToken}`)
            .send(validQuestionPayload(roomId));
    }

    async function deleteQuestion(questionId: string, token: string) {
        return request(app)
            .delete(`/questions/${questionId}`)
            .set("Authorization", `Bearer ${token}`);
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

        const adminRoom = await createRoom(
            adminId,
            `TEST-${suffix}-A`,
        );

        adminRoomId = adminRoom.id;

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
                status: RoomStatus.WAITING,
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

    it("deve excluir uma pergunta do próprio host (200)", async () => {
        const created = await createQuestion(adminRoomId);

        expect(created.status).toBe(201);

        const response = await deleteQuestion(
            created.body.id,
            adminToken,
        );

        expect(response.status).toBe(200);

        const deletedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
            include: { options: true },
        });

        expect(deletedQuestion).toBeNull();
    });

    it("deve excluir também as alternativas da pergunta", async () => {
        const created = await createQuestion(adminRoomId);

        expect(created.status).toBe(201);

        const questionId = created.body.id;

        const optionsBefore = await prisma.questionOption.count({
            where: { questionId },
        });

        expect(optionsBefore).toBe(4);

        const response = await deleteQuestion(
            questionId,
            adminToken,
        );

        expect(response.status).toBe(200);

        const optionsAfter = await prisma.questionOption.count({
            where: { questionId },
        });

        expect(optionsAfter).toBe(0);
    });

    it("deve retornar 403 quando outro usuário tentar excluir a pergunta", async () => {
        const created = await createQuestion(adminRoomId);

        const response = await deleteQuestion(
            created.body.id,
            outsiderToken,
        );

        expect(response.status).toBe(403);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
        });

        expect(savedQuestion).not.toBeNull();
    });

    it("deve retornar 404 quando a pergunta não existir", async () => {
        const response = await deleteQuestion(
            randomUUID(),
            adminToken,
        );

        expect(response.status).toBe(404);
    });

    it("deve retornar 409 quando a sala estiver em andamento", async () => {
        const created = await createQuestion(adminRoomId);

        await prisma.room.update({
            where: { id: adminRoomId },
            data: { status: RoomStatus.IN_PROGRESS },
        });

        const response = await deleteQuestion(
            created.body.id,
            adminToken,
        );

        expect(response.status).toBe(409);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
        });

        expect(savedQuestion).not.toBeNull();
    });

    it("deve retornar 409 quando a sala estiver finalizada", async () => {
        const created = await createQuestion(adminRoomId);

        await prisma.room.update({
            where: { id: adminRoomId },
            data: { status: RoomStatus.FINISHED },
        });

        const response = await deleteQuestion(
            created.body.id,
            adminToken,
        );

        expect(response.status).toBe(409);

        const savedQuestion = await prisma.question.findUnique({
            where: { id: created.body.id },
        });

        expect(savedQuestion).not.toBeNull();
    });

    it("deve retornar 401 quando não houver token", async () => {
        const created = await createQuestion(adminRoomId);

        const response = await request(app)
            .delete(`/questions/${created.body.id}`);

        expect(response.status).toBe(401);
    });

    it("deve retornar 401 quando o token for inválido", async () => {
        const created = await createQuestion(adminRoomId);

        const response = await request(app)
            .delete(`/questions/${created.body.id}`)
            .set("Authorization", "Bearer token-invalido");

        expect(response.status).toBe(401);
    });
});
