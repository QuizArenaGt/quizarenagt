import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { GameStatus, QuestionType, Role, RoomStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { JwtService } from "../../src/auth/jwt.service.js";
import {
    IMPORT_QUESTIONS_MAX_PAYLOAD_BYTES,
    MAX_QUESTIONS_PER_IMPORT,
} from "../../src/questions/import-questions.dto.js";

describe("POST /rooms/:id/questions/import - Integração", () => {
    const jwtService = new JwtService();

    let hostToken: string;
    let outsiderToken: string;
    let hostId: string;
    let outsiderId: string;
    let roomId: string;

    const userIds: string[] = [];
    const roomIds: string[] = [];

    const validMixedBatch = {
        questions: [
            {
                statement: "Qual protocolo garante entrega ordenada?",
                type: QuestionType.MULTIPLE_CHOICE,
                options: [
                    { text: "UDP", isCorrect: false },
                    { text: "TCP", isCorrect: true },
                ],
            },
            {
                statement: "Qual porta padrão HTTPS?",
                type: QuestionType.MULTIPLE_CHOICE,
                options: [
                    { text: "80", isCorrect: false },
                    { text: "443", isCorrect: true },
                    { text: "22", isCorrect: false },
                ],
            },
            {
                statement: "Qual camada realiza roteamento lógico?",
                type: QuestionType.MULTIPLE_CHOICE,
                options: [
                    { text: "Física", isCorrect: false },
                    { text: "Enlace", isCorrect: false },
                    { text: "Rede", isCorrect: true },
                    { text: "Aplicação", isCorrect: false },
                ],
            },
            {
                statement: "DNS traduz nomes de domínio para endereços IP.",
                type: QuestionType.TRUE_FALSE,
                options: [
                    { text: "Verdadeiro", isCorrect: true },
                    { text: "Falso", isCorrect: false },
                ],
            },
            {
                statement: "HTTP é um protocolo exclusivamente da camada física.",
                type: QuestionType.TRUE_FALSE,
                options: [
                    { text: "Verdadeiro", isCorrect: false },
                    { text: "Falso", isCorrect: true },
                ],
            },
        ],
    };

    beforeAll(async () => {
        await prisma.$connect();

        const host = await prisma.user.create({
            data: {
                name: "Host Importação JSON",
                email: `import-host-${randomUUID()}@test.com`,
                password: "hash",
                role: Role.HOST,
            },
        });
        const outsider = await prisma.user.create({
            data: {
                name: "Outro Host",
                email: `import-outsider-${randomUUID()}@test.com`,
                password: "hash",
                role: Role.HOST,
            },
        });

        hostId = host.id;
        outsiderId = outsider.id;
        userIds.push(hostId, outsiderId);

        hostToken = jwtService.generate({ id: hostId, role: Role.HOST });
        outsiderToken = jwtService.generate({
            id: outsiderId,
            role: Role.HOST,
        });

        const room = await prisma.room.create({
            data: {
                code: `IMP${randomUUID().slice(0, 3).toUpperCase()}`,
                name: "Sala Importação",
                theme: "Redes",
                hostId,
                maxPlayers: 10,
                questionTime: 30,
                status: RoomStatus.ACTIVE,
                games: {
                    create: {
                        status: GameStatus.WAITING,
                        maxPlayers: 10,
                        questionTime: 30,
                    },
                },
            },
        });
        roomId = room.id;
        roomIds.push(roomId);
    });

    beforeEach(async () => {
        await prisma.roundAnswer.deleteMany({
            where: { round: { game: { roomId } } },
        });
        await prisma.round.deleteMany({
            where: { game: { roomId } },
        });
        await prisma.roomQuestionSnapshot.deleteMany({
            where: { game: { roomId } },
        });
        await prisma.gamePlayer.deleteMany({
            where: { game: { roomId } },
        });
        await prisma.game.deleteMany({
            where: { roomId },
        });
        await prisma.question.deleteMany({
            where: { roomId },
        });

        await prisma.room.update({
            where: { id: roomId },
            data: { status: RoomStatus.ACTIVE, archivedAt: null },
        });
        await prisma.game.create({
            data: {
                roomId,
                status: GameStatus.WAITING,
                maxPlayers: 10,
                questionTime: 30,
            },
        });
    });

    afterAll(async () => {
        if (roomIds.length > 0) {
            await prisma.room.deleteMany({
                where: { id: { in: roomIds } },
            });
        }
        if (userIds.length > 0) {
            await prisma.user.deleteMany({
                where: { id: { in: userIds } },
            });
        }
        await prisma.$disconnect();
    });

    it("deve importar lote misto válido, acrescentar após perguntas existentes e preservar ordem das questões e alternativas", async () => {
        // Cria uma pergunta prévia manualmente para confirmar comportamento append (sem apagar/substituir).
        const manualRes = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${hostToken}`)
            .send({
                roomId,
                statement: "Pergunta pré-existente 0",
                type: QuestionType.MULTIPLE_CHOICE,
                options: [
                    { text: "Correta", isCorrect: true },
                    { text: "Errada", isCorrect: false },
                ],
            });
        expect(manualRes.status).toBe(201);

        const importRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validMixedBatch);

        expect(importRes.status).toBe(201);
        expect(importRes.body.importedCount).toBe(5);
        expect(importRes.body.questions).toHaveLength(5);

        const listRes = await request(app)
            .get(`/questions?roomId=${roomId}`)
            .set("Authorization", `Bearer ${hostToken}`);

        expect(listRes.status).toBe(200);
        expect(listRes.body).toHaveLength(6);
        expect(
            (listRes.body as { statement: string }[]).map((q) => q.statement),
        ).toEqual([
            "Pergunta pré-existente 0",
            "Qual protocolo garante entrega ordenada?",
            "Qual porta padrão HTTPS?",
            "Qual camada realiza roteamento lógico?",
            "DNS traduz nomes de domínio para endereços IP.",
            "HTTP é um protocolo exclusivamente da camada física.",
        ]);

        const q3Options = listRes.body[3].options as {
            text: string;
            position: number;
            isCorrect: boolean;
        }[];
        expect(q3Options.map((o) => [o.position, o.text, o.isCorrect])).toEqual([
            [0, "Física", false],
            [1, "Enlace", false],
            [2, "Rede", true],
            [3, "Aplicação", false],
        ]);
    });

    it("deve rejeitar lotes inválidos sem persistência parcial no PostgreSQL", async () => {
        const invalidPayloads: unknown[] = [
            {},
            { questions: [] },
            {
                questions: Array.from(
                    { length: MAX_QUESTIONS_PER_IMPORT + 1 },
                    (_, i) => ({
                        statement: `Q${i + 1}`,
                        type: QuestionType.TRUE_FALSE,
                        options: [
                            { text: "Verdadeiro", isCorrect: true },
                            { text: "Falso", isCorrect: false },
                        ],
                    }),
                ),
            },
            {
                // 1a pergunta válida + 2a inválida -> nenhuma deve ser persistida
                questions: [
                    validMixedBatch.questions[0],
                    {
                        statement: "   ",
                        options: [
                            { text: "A", isCorrect: true },
                            { text: "B", isCorrect: false },
                        ],
                    },
                ],
            },
            {
                questions: [
                    validMixedBatch.questions[0],
                    {
                        statement: "Sem correta",
                        options: [
                            { text: "A", isCorrect: false },
                            { text: "B", isCorrect: false },
                        ],
                    },
                ],
            },
            {
                questions: [
                    {
                        statement: "Múltiplas corretas",
                        options: [
                            { text: "A", isCorrect: true },
                            { text: "B", isCorrect: true },
                        ],
                    },
                ],
            },
            {
                questions: [
                    {
                        statement: "Alternativas duplicadas",
                        options: [
                            { text: "Mesma", isCorrect: true },
                            { text: "  mesma ", isCorrect: false },
                        ],
                    },
                ],
            },
            {
                questions: [
                    validMixedBatch.questions[0],
                    {
                        ...validMixedBatch.questions[0],
                        statement: `  ${validMixedBatch.questions[0]!.statement.toUpperCase()}  `,
                    },
                ],
            },
            {
                questions: [
                    {
                        statement: "V/F fora do padrão",
                        type: QuestionType.TRUE_FALSE,
                        options: [
                            { text: "True", isCorrect: true },
                            { text: "False", isCorrect: false },
                        ],
                    },
                ],
            },
        ];

        for (const payload of invalidPayloads) {
            const res = await request(app)
                .post(`/rooms/${roomId}/questions/import`)
                .set("Authorization", `Bearer ${hostToken}`)
                .send(payload);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("errors");
        }

        const totalInDb = await prisma.question.count({ where: { roomId } });
        expect(totalInDb).toBe(0);
    });

    it("deve tratar JSON malformado (400) e payload acima de 1 MB (413) com mensagens amigáveis sem quebrar limite global de 100 KB", async () => {
        const malformedRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .set("Content-Type", "application/json")
            .send('{"questions": [');
        expect(malformedRes.status).toBe(400);
        expect(malformedRes.body.message).toMatch(/malformado/i);

        const oversizedBody = JSON.stringify({
            questions: [
                {
                    statement: "x".repeat(
                        IMPORT_QUESTIONS_MAX_PAYLOAD_BYTES + 1024,
                    ),
                    options: [
                        { text: "A", isCorrect: true },
                        { text: "B", isCorrect: false },
                    ],
                },
            ],
        });
        const tooLargeRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .set("Content-Type", "application/json")
            .send(oversizedBody);
        expect(tooLargeRes.status).toBe(413);
        expect(tooLargeRes.body.message).toMatch(/1 MB/i);

        // Rota comum de perguntas continua respeitando o limite global padrão (100 KB) sem afetar o importador
        const mediumNonImportBody = JSON.stringify({
            roomId,
            statement: "a".repeat(150 * 1024),
            options: [
                { text: "A", isCorrect: true },
                { text: "B", isCorrect: false },
            ],
        });
        const normalLimitRes = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${hostToken}`)
            .set("Content-Type", "application/json")
            .send(mediumNonImportBody);
        expect(normalLimitRes.status).toBe(413);
    });

    it("deve exigir autenticação (401), autorização do host (403), existência da sala (404) e editabilidade (409)", async () => {
        const unauthRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .send(validMixedBatch);
        expect(unauthRes.status).toBe(401);

        const forbiddenRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${outsiderToken}`)
            .send(validMixedBatch);
        expect(forbiddenRes.status).toBe(403);

        const notFoundRes = await request(app)
            .post(`/rooms/${randomUUID()}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validMixedBatch);
        expect(notFoundRes.status).toBe(404);

        // Sala em IN_PROGRESS bloqueia importação com 409
        await prisma.game.updateMany({
            where: { roomId },
            data: { status: GameStatus.IN_PROGRESS, startedAt: new Date() },
        });
        const inProgressRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validMixedBatch);
        expect(inProgressRes.status).toBe(409);

        // Sala ARCHIVED também bloqueia com 409
        await prisma.game.updateMany({
            where: { roomId },
            data: { status: GameStatus.WAITING, startedAt: null },
        });
        await prisma.room.update({
            where: { id: roomId },
            data: { status: RoomStatus.ARCHIVED, archivedAt: new Date() },
        });
        const archivedRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validMixedBatch);
        expect(archivedRes.status).toBe(409);

        expect(await prisma.question.count({ where: { roomId } })).toBe(0);
    });

    it("deve serializar concorrência com início de partida (start) e gerar snapshot na ordem exata após importação", async () => {
        const roomRow = await prisma.room.findUniqueOrThrow({
            where: { id: roomId },
            select: { code: true },
        });

        const j1 = await request(app)
            .post("/rooms/join")
            .send({ code: roomRow.code, nickname: "Ana" });
        const j2 = await request(app)
            .post("/rooms/join")
            .send({ code: roomRow.code, nickname: "Bob" });
        expect(j1.status).toBe(201);
        expect(j2.status).toBe(201);

        // Dispara importação e tentativa concorrente de start: sem deadlock e estado sempre consistente.
        const [impRes, startRes] = await Promise.all([
            request(app)
                .post(`/rooms/${roomId}/questions/import`)
                .set("Authorization", `Bearer ${hostToken}`)
                .send(validMixedBatch),
            request(app)
                .post(`/rooms/${roomId}/start`)
                .set("Authorization", `Bearer ${hostToken}`),
        ]);

        expect([201, 409]).toContain(impRes.status);
        expect([200, 409]).toContain(startRes.status);

        // Se start rodou depois da importação (200), snapshot deve conter todas as 5 perguntas na ordem exata;
        // se start rodou antes (<5 perguntas -> 409), importação (201) concluiu e start logo em seguida funciona.
        if (startRes.status === 409) {
            expect(impRes.status).toBe(201);
            const secondStart = await request(app)
                .post(`/rooms/${roomId}/start`)
                .set("Authorization", `Bearer ${hostToken}`);
            expect(secondStart.status).toBe(200);
        }

        const snapshot = await prisma.roomQuestionSnapshot.findFirst({
            where: { game: { roomId } },
            include: {
                questions: { orderBy: { position: "asc" } },
            },
        });
        expect(snapshot?.questions.map((q) => q.statement)).toEqual(
            validMixedBatch.questions.map((q) => q.statement),
        );
    });

    it("deve manter criação manual imediatamente após importação grande no final e preservar ordem em importações consecutivas", async () => {
        // Lote grande (80 questões -> createdAt avança +79ms no DB) e payload > 100 KB válido
        const batch1 = {
            questions: Array.from({ length: 80 }, (_, idx) => ({
                statement: `Lote1-${String(idx + 1).padStart(3, "0")} ${"x".repeat(200)}`,
                type: QuestionType.MULTIPLE_CHOICE,
                options: [
                    { text: "Correta", isCorrect: true },
                    { text: "Errada", isCorrect: false },
                ],
            })),
        };

        const batch1Res = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(batch1);
        expect(batch1Res.status).toBe(201);
        expect(batch1Res.body.importedCount).toBe(80);

        // Criação manual imediatamente (< 10ms) após o lote de 80 questões deve ir estritamente para o final (#81)
        const manualRes = await request(app)
            .post("/questions")
            .set("Authorization", `Bearer ${hostToken}`)
            .send({
                roomId,
                statement: "Manual-081 após lote grande",
                type: QuestionType.TRUE_FALSE,
                options: [
                    { text: "Verdadeiro", isCorrect: true },
                    { text: "Falso", isCorrect: false },
                ],
            });
        expect(manualRes.status).toBe(201);

        // Segunda importação consecutiva deve ir após a manual (#82, #83)
        const batch2 = {
            questions: [
                {
                    statement: "Lote2-082",
                    type: QuestionType.TRUE_FALSE,
                    options: [
                        { text: "Verdadeiro", isCorrect: true },
                        { text: "Falso", isCorrect: false },
                    ],
                },
                {
                    statement: "Lote2-083",
                    type: QuestionType.TRUE_FALSE,
                    options: [
                        { text: "Verdadeiro", isCorrect: true },
                        { text: "Falso", isCorrect: false },
                    ],
                },
            ],
        };
        const batch2Res = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(batch2);
        expect(batch2Res.status).toBe(201);

        const listRes = await request(app)
            .get(`/questions?roomId=${roomId}`)
            .set("Authorization", `Bearer ${hostToken}`);
        expect(listRes.status).toBe(200);
        const statements = (listRes.body as { statement: string }[]).map(
            (q) => q.statement,
        );
        expect(statements).toEqual([
            ...batch1.questions.map((q) => q.statement),
            "Manual-081 após lote grande",
            "Lote2-082",
            "Lote2-083",
        ]);
    });

    it("deve serializar criação manual, edição e exclusão concorrentes com POST /rooms/:id/start sem mutar após IN_PROGRESS", async () => {
        // Semente com 5 perguntas válidas
        const seedRes = await request(app)
            .post(`/rooms/${roomId}/questions/import`)
            .set("Authorization", `Bearer ${hostToken}`)
            .send(validMixedBatch);
        expect(seedRes.status).toBe(201);
        const firstQuestionId = seedRes.body.questions[0].id as string;
        const secondQuestionId = seedRes.body.questions[1].id as string;

        const roomRow = await prisma.room.findUniqueOrThrow({
            where: { id: roomId },
            select: { code: true },
        });
        await request(app)
            .post("/rooms/join")
            .send({ code: roomRow.code, nickname: "Ana" });
        await request(app)
            .post("/rooms/join")
            .send({ code: roomRow.code, nickname: "Bob" });

        // Dispara start em paralelo com create, update e delete de perguntas
        const [startRes, createRes, updateRes, deleteRes] = await Promise.all([
            request(app)
                .post(`/rooms/${roomId}/start`)
                .set("Authorization", `Bearer ${hostToken}`),
            request(app)
                .post("/questions")
                .set("Authorization", `Bearer ${hostToken}`)
                .send({
                    roomId,
                    statement: "Pergunta concorrente com start",
                    type: QuestionType.TRUE_FALSE,
                    options: [
                        { text: "Verdadeiro", isCorrect: true },
                        { text: "Falso", isCorrect: false },
                    ],
                }),
            request(app)
                .put(`/questions/${firstQuestionId}`)
                .set("Authorization", `Bearer ${hostToken}`)
                .send({
                    statement: "Editada em concorrência",
                    type: QuestionType.TRUE_FALSE,
                    options: [
                        { text: "Verdadeiro", isCorrect: true },
                        { text: "Falso", isCorrect: false },
                    ],
                }),
            request(app)
                .delete(`/questions/${secondQuestionId}`)
                .set("Authorization", `Bearer ${hostToken}`),
        ]);

        // Start sempre deve suceder (pois mesmo se delete rodar antes, 4 perguntas bloquearia start -> 409; se start rodar antes, start é 200 e mutações pós-start são 409)
        expect([200, 409]).toContain(startRes.status);

        if (startRes.status === 200) {
            const snapshot = await prisma.roomQuestionSnapshot.findFirstOrThrow({
                where: { game: { roomId } },
                include: { questions: { orderBy: { position: "asc" } } },
            });
            const liveQuestions = await prisma.question.findMany({
                where: { roomId },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            });

            // Toda mutação que retornou 200/201 ocorreu ANTES do lock de startIfReady, então snapshot e banco permanecem 100% alinhados
            expect(snapshot.questions.map((q) => q.statement)).toEqual(
                liveQuestions.map((q) => q.statement),
            );

            // Mutações que ocorreram DEPOIS de startIfReady devem ter sido rejeitadas com 409
            if (createRes.status === 409) {
                expect(
                    liveQuestions.some(
                        (q) => q.statement === "Pergunta concorrente com start",
                    ),
                ).toBe(false);
            }
            if (updateRes.status === 409) {
                expect(
                    liveQuestions.find((q) => q.id === firstQuestionId)?.statement,
                ).not.toBe("Editada em concorrência");
            }
            if (deleteRes.status === 409) {
                expect(
                    liveQuestions.some((q) => q.id === secondQuestionId),
                ).toBe(true);
            }
        }
    });
});
