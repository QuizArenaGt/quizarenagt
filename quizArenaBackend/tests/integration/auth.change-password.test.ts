import { createServer, type Server as HttpServer } from "node:http";
import { compare, hash } from "bcryptjs";
import request from "supertest";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { app } from "../../src/app.js";
import { resetAuthRateLimiters } from "../../src/auth/rate-limit.middleware.js";
import { prisma } from "../../src/database/prisma.js";
import {
    emitRoomEvent,
    setSocketServer,
} from "../../src/realtime/room-events.js";
import { createSocketServer } from "../../src/realtime/socket.server.js";

const TEST_EMAIL = "change.password.integration@email.com";
const OTHER_EMAIL = "change.password.other@email.com";
const INITIAL_PASSWORD = "SenhaInicial123";
const NEW_PASSWORD = "NovaSenhaSegura456";

async function cleanTestUser(): Promise<void> {
    await prisma.room.deleteMany({
        where: {
            host: {
                email: {
                    in: [TEST_EMAIL, OTHER_EMAIL],
                },
            },
        },
    });
    await prisma.user.deleteMany({
        where: {
            email: {
                in: [TEST_EMAIL, OTHER_EMAIL],
            },
        },
    });
}

async function openHostPollingSocket(
    port: number,
    token: string,
    roomCode: string,
): Promise<{
    sid: string;
    connectResponseBody: string;
    pollRaw: () => Promise<string>;
    close: () => Promise<void>;
}> {
    const baseUrl = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;
    const openRes = await fetch(baseUrl);
    const openText = await openRes.text();
    const handshakeJson = JSON.parse(openText.slice(1)) as { sid: string };
    const sid = handshakeJson.sid;

    await fetch(`${baseUrl}&sid=${sid}`, {
        method: "POST",
        body: `40${JSON.stringify({ token, roomCode })}`,
    });

    const connectPoll = await fetch(`${baseUrl}&sid=${sid}`);
    const connectResponseBody = await connectPoll.text();
    const eventsPoll =
        connectResponseBody.startsWith("40") &&
        !connectResponseBody.includes("realtime:connected")
            ? await (await fetch(`${baseUrl}&sid=${sid}`)).text()
            : "";

    return {
        sid,
        connectResponseBody: `${connectResponseBody}\n${eventsPoll}`,
        pollRaw: async () => {
            const res = await fetch(`${baseUrl}&sid=${sid}`);
            return res.text();
        },
        close: async () => {
            await fetch(`${baseUrl}&sid=${sid}`, {
                method: "POST",
                body: "41",
            }).catch(() => undefined);
        },
    };
}

describe("POST /auth/change-password - Integração", () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    beforeEach(async () => {
        resetAuthRateLimiters();
        await cleanTestUser();
        await prisma.user.create({
            data: {
                name: "Usuário Alterar Senha",
                email: TEST_EMAIL,
                password: await hash(INITIAL_PASSWORD, 12),
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        resetAuthRateLimiters();
        await cleanTestUser();
        await prisma.$disconnect();
    });

    it("retorna 401 quando usuário não está autenticado", async () => {
        const res = await request(app)
            .post("/auth/change-password")
            .send({
                currentPassword: INITIAL_PASSWORD,
                newPassword: NEW_PASSWORD,
            });

        expect(res.status).toBe(401);
    });

    it("retorna 400 para dados inválidos ou nova senha igual à atual", async () => {
        const loginRes = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
        const token = loginRes.body.token as string;

        const shortRes = await request(app)
            .post("/auth/change-password")
            .set("Authorization", `Bearer ${token}`)
            .send({ currentPassword: "", newPassword: "123" });

        expect(shortRes.status).toBe(400);
        expect(shortRes.body.errors).toEqual({
            currentPassword: "A senha atual é obrigatória.",
            newPassword: "A nova senha deve possuir pelo menos 8 caracteres.",
        });

        const sameRes = await request(app)
            .post("/auth/change-password")
            .set("Authorization", `Bearer ${token}`)
            .send({
                currentPassword: INITIAL_PASSWORD,
                newPassword: INITIAL_PASSWORD,
            });

        expect(sameRes.status).toBe(400);
        expect(sameRes.body.errors).toEqual({
            newPassword: "A nova senha deve ser diferente da senha atual.",
        });
    });

    it("retorna 401 quando a senha atual está incorreta sem alterar o hash no banco", async () => {
        const loginRes = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
        const token = loginRes.body.token as string;

        const wrongRes = await request(app)
            .post("/auth/change-password")
            .set("Authorization", `Bearer ${token}`)
            .send({
                currentPassword: "SenhaAtualErrada999",
                newPassword: NEW_PASSWORD,
            });

        expect(wrongRes.status).toBe(401);
        expect(wrongRes.body.errors).toEqual({
            currentPassword: "Senha atual incorreta.",
        });

        const user = await prisma.user.findUniqueOrThrow({
            where: { email: TEST_EMAIL },
        });
        expect(await compare(INITIAL_PASSWORD, user.password)).toBe(true);
    });

    it("altera a senha no PostgreSQL, invalida tokens JWT antigos, retorna novo JWT e bloqueia login com senha antiga", async () => {
        const firstLogin = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
        const oldToken = firstLogin.body.token as string;

        const changeRes = await request(app)
            .post("/auth/change-password")
            .set("Authorization", `Bearer ${oldToken}`)
            .send({
                currentPassword: INITIAL_PASSWORD,
                newPassword: NEW_PASSWORD,
            });

        expect(changeRes.status).toBe(200);
        expect(changeRes.body.message).toBe("Senha alterada com sucesso!");
        expect(changeRes.body.token).toBeTypeOf("string");
        expect(changeRes.body.password).toBeUndefined();

        const newToken = changeRes.body.token as string;

        // JWT emitido antes da alteração de senha é rejeitado
        const meOld = await request(app)
            .get("/auth/me")
            .set("Authorization", `Bearer ${oldToken}`);
        expect(meOld.status).toBe(401);

        // Novo JWT retornado permanece válido
        const meNew = await request(app)
            .get("/auth/me")
            .set("Authorization", `Bearer ${newToken}`);
        expect(meNew.status).toBe(200);

        // Login com senha antiga falha e com nova senha funciona
        const oldLogin = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
        expect(oldLogin.status).toBe(401);

        const newLogin = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: NEW_PASSWORD });
        expect(newLogin.status).toBe(200);
    });

    it("encerra todas as conexões Socket.IO (múltiplas abas/salas) do usuário em changePassword sem desconectar jogadores ou outros hosts", async () => {
        const otherUser = await prisma.user.create({
            data: {
                name: "Outro Host",
                email: OTHER_EMAIL,
                password: await hash(INITIAL_PASSWORD, 12),
            },
        });
        const affectedUser = await prisma.user.findUniqueOrThrow({
            where: { email: TEST_EMAIL },
        });

        const httpServer: HttpServer = createServer(app);
        const io = createSocketServer(httpServer);
        await new Promise<void>((resolve) => {
            httpServer.listen(0, "127.0.0.1", () => resolve());
        });

        try {
            const address = httpServer.address();
            if (!address || typeof address === "string") {
                throw new Error("Porta HTTP inválida no teste.");
            }

            const host1Login = await request(app)
                .post("/auth/login")
                .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
            const host1OldToken = host1Login.body.token as string;

            const host2Login = await request(app)
                .post("/auth/login")
                .send({ email: OTHER_EMAIL, password: INITIAL_PASSWORD });
            const host2Token = host2Login.body.token as string;

            const createRoom1 = await request(app)
                .post("/rooms")
                .set("Authorization", `Bearer ${host1OldToken}`)
                .send({
                    name: "Sala Host 1A",
                    maxPlayers: 10,
                    questionTime: 30,
                });
            expect(createRoom1.status).toBe(201);
            const room1 = createRoom1.body as { id: string; code: string };

            const createRoom1b = await request(app)
                .post("/rooms")
                .set("Authorization", `Bearer ${host1OldToken}`)
                .send({
                    name: "Sala Host 1B",
                    maxPlayers: 10,
                    questionTime: 30,
                });
            expect(createRoom1b.status).toBe(201);
            const room1b = createRoom1b.body as { id: string; code: string };

            const createRoom2 = await request(app)
                .post("/rooms")
                .set("Authorization", `Bearer ${host2Token}`)
                .send({
                    name: "Sala Host 2",
                    maxPlayers: 10,
                    questionTime: 30,
                });
            expect(createRoom2.status).toBe(201);
            const room2 = createRoom2.body as { id: string; code: string };

            // Jogador entra em room1 (não deve ser desconectado pela troca de senha do host)
            const joinRes = await request(app)
                .post("/rooms/join")
                .send({ code: room1.code, nickname: "JogadorFica" });
            expect(joinRes.status).toBe(201);
            const playerToken = joinRes.body.sessionToken as string;

            const host1SockA = await openHostPollingSocket(
                address.port,
                host1OldToken,
                room1.code,
            );
            const host1SockB = await openHostPollingSocket(
                address.port,
                host1OldToken,
                room1b.code,
            );
            const playerSock = await openHostPollingSocket(
                address.port,
                playerToken,
                room1.code,
            );
            const host2Sock = await openHostPollingSocket(
                address.port,
                host2Token,
                room2.code,
            );

            expect(host1SockA.connectResponseBody).toContain("realtime:connected");
            expect(host1SockB.connectResponseBody).toContain("realtime:connected");
            expect(playerSock.connectResponseBody).toContain("realtime:connected");
            expect(host2Sock.connectResponseBody).toContain("realtime:connected");
            expect(await io.in(`user:${affectedUser.id}`).fetchSockets()).toHaveLength(2);
            expect(await io.in(`room:${room1.id}`).fetchSockets()).toHaveLength(2); // host1SockA + playerSock
            expect(await io.in(`user:${otherUser.id}`).fetchSockets()).toHaveLength(1);

            // 1. Alteração de senha desconecta ambas as abas de host1, preservando o jogador da sala e host2
            const changeRes = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${host1OldToken}`)
                .send({
                    currentPassword: INITIAL_PASSWORD,
                    newPassword: NEW_PASSWORD,
                });
            expect(changeRes.status).toBe(200);
            const host1NewToken = changeRes.body.token as string;

            expect(await io.in(`user:${affectedUser.id}`).fetchSockets()).toHaveLength(0);
            expect(await io.in(`room:${room1.id}`).fetchSockets()).toHaveLength(1); // somente playerSock permanece
            expect(await io.in(`user:${otherUser.id}`).fetchSockets()).toHaveLength(1);

            // Broadcast na sala do outro usuário continua funcionando
            emitRoomEvent(room2.id, "room:updated", { roomId: room2.id });
            const host2EventsRaw = await host2Sock.pollRaw();
            expect(host2EventsRaw).toContain("room:updated");

            // Reconexão com token antigo é rejeitada no handshake; com token novo é aceita
            const rejectedReconnect = await openHostPollingSocket(
                address.port,
                host1OldToken,
                room1.code,
            );
            expect(rejectedReconnect.connectResponseBody).toContain("Token inválido ou expirado.");

            const freshReconnect = await openHostPollingSocket(
                address.port,
                host1NewToken,
                room1.code,
            );
            expect(freshReconnect.connectResponseBody).toContain("realtime:connected");
            expect(await io.in(`user:${affectedUser.id}`).fetchSockets()).toHaveLength(1);

            await host1SockA.close();
            await host1SockB.close();
            await playerSock.close();
            await host2Sock.close();
            await rejectedReconnect.close();
            await freshReconnect.close();
        } finally {
            setSocketServer(null as never);
            await new Promise<void>((resolve) => io.close(() => resolve()));
            httpServer.close();
        }
    });
});
