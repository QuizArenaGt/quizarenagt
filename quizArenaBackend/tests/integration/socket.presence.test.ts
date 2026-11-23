import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import request from "supertest";
import { hash } from "bcryptjs";

import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { PlayerPresenceRegistry } from "../../src/realtime/player-presence.js";
import { createSocketServer } from "../../src/realtime/socket.server.js";

const password = "12345678";
const hostEmail = "socket.presence.host@email.com";

type RecordedEvent = {
    event: string;
    payload: Record<string, unknown>;
};

async function openPollingSocket(
    port: number,
    token: string,
): Promise<{
    sid: string;
    events: RecordedEvent[];
    pollOnce: () => Promise<RecordedEvent[]>;
    close: () => Promise<void>;
}> {
    const baseUrl = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;
    const openRes = await fetch(baseUrl);
    const openText = await openRes.text();
    const handshakeJson = JSON.parse(openText.slice(1)) as { sid: string };
    const sid = handshakeJson.sid;

    const connectRes = await fetch(`${baseUrl}&sid=${sid}`, {
        method: "POST",
        body: `40${JSON.stringify({ token })}`,
    });
    expect(connectRes.status).toBe(200);

    const events: RecordedEvent[] = [];

    const parseEioPayload = (raw: string): RecordedEvent[] => {
        const parsed: RecordedEvent[] = [];
        for (const chunk of raw.split("\x1e")) {
            if (chunk.startsWith("42")) {
                const [event, payload] = JSON.parse(chunk.slice(2)) as [
                    string,
                    Record<string, unknown>,
                ];
                parsed.push({ event, payload });
                events.push({ event, payload });
            } else if (chunk.startsWith("44")) {
                throw new Error(`SOCKET_AUTH_REJECTED:${chunk.slice(2)}`);
            }
        }
        return parsed;
    };

    const pollOnce = async () => {
        const res = await fetch(`${baseUrl}&sid=${sid}`);
        const text = await res.text();
        return parseEioPayload(text);
    };

    // Recebe conexão inicial + realtime:connected
    await pollOnce();

    return {
        sid,
        events,
        pollOnce,
        close: async () => {
            await fetch(`${baseUrl}&sid=${sid}`, {
                method: "POST",
                body: "41",
            }).catch(() => undefined);
        },
    };
}

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
        where: { email: hostEmail },
    });
}

async function createInProgressGame() {
    await prisma.user.create({
        data: {
            name: "Host Presença",
            email: hostEmail,
            password: await hash(password, 10),
        },
    });

    const loginRes = await request(app)
        .post("/auth/login")
        .send({ email: hostEmail, password });
    const hostToken = loginRes.body.token as string;

    const roomRes = await request(app)
        .post("/rooms")
        .set("Authorization", `Bearer ${hostToken}`)
        .send({
            name: "Sala Presença",
            theme: "Realtime",
            maxPlayers: 4,
            questionTime: 30,
        });
    const room = roomRes.body as {
        id: string;
        code: string;
        currentGame: { id: string };
    };

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
                            text: `Opção ${optIdx + 1}`,
                            isCorrect: optIdx === 0,
                            position: optIdx,
                        })),
                    },
                },
            }),
        ),
    );

    const aliceJoin = await request(app)
        .post("/rooms/join")
        .send({ code: room.code, nickname: "Alice" });
    const bobJoin = await request(app)
        .post("/rooms/join")
        .send({ code: room.code, nickname: "Bob" });

    await request(app)
        .post(`/rooms/${room.id}/start`)
        .set("Authorization", `Bearer ${hostToken}`);

    return {
        hostToken,
        room,
        alice: aliceJoin.body as {
            player: { id: string; nickname: string };
            sessionToken: string;
        },
        bob: bobJoin.body as {
            player: { id: string; nickname: string };
            sessionToken: string;
        },
    };
}

describe("Presença, múltiplos sockets, desconexão e reconexão - Integração", () => {
    let httpServer: HttpServer;
    let port: number;
    let presenceRegistry: PlayerPresenceRegistry;

    beforeAll(async () => {
        await prisma.$connect();
        presenceRegistry = new PlayerPresenceRegistry();
        httpServer = createServer(app);
        createSocketServer(httpServer, presenceRegistry);
        await new Promise<void>((resolve) => {
            httpServer.listen(0, "127.0.0.1", () => {
                const address = httpServer.address();
                port = typeof address === "object" && address ? address.port : 0;
                resolve();
            });
        });
    });

    beforeEach(async () => {
        await cleanTestData();
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
        await cleanTestData();
        await prisma.$disconnect();
    });

    it("ciclo completo: múltiplos sockets, desconexão com tolerância de 60s mantendo rodada aberta, reconexão e bloqueio após saída voluntária", async () => {
        const { hostToken, room, alice, bob } = await createInProgressGame();

        const bobSock = await openPollingSocket(port, bob.sessionToken);
        const aliceSock1 = await openPollingSocket(port, alice.sessionToken);
        const aliceSock2 = await openPollingSocket(port, alice.sessionToken);

        await presenceRegistry.whenIdle(alice.player.id);
        await presenceRegistry.whenIdle(bob.player.id);

        expect(presenceRegistry.getActiveSocketCount(alice.player.id)).toBe(2);
        expect(presenceRegistry.getPlayerPresence(alice.player.id)).toBe("ONLINE");

        // Fecha apenas 1 dos 2 sockets de Alice: deve permanecer ONLINE e sem disconnectedAt
        await aliceSock1.close();
        await new Promise((r) => setTimeout(r, 80));
        await presenceRegistry.whenIdle(alice.player.id);

        expect(presenceRegistry.getActiveSocketCount(alice.player.id)).toBe(1);
        expect(presenceRegistry.getPlayerPresence(alice.player.id)).toBe("ONLINE");

        const aliceAfterFirstDrop = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: alice.player.id },
        });
        expect(aliceAfterFirstDrop.disconnectedAt).toBeNull();
        expect(aliceAfterFirstDrop.reconnectDeadlineAt).toBeNull();

        // Host abre rodada 1; Bob responde, Alice fecha o último socket (fica DISCONNECTED)
        const r1Res = await request(app)
            .post(`/rooms/${room.id}/rounds`)
            .set("Authorization", `Bearer ${hostToken}`);
        const r1Id = r1Res.body.round.id as string;
        const r1Correct = await prisma.roomQuestionSnapshotOption.findFirstOrThrow({
            where: {
                questionSnapshotId: (
                    await prisma.round.findUniqueOrThrow({ where: { id: r1Id } })
                ).snapshotQuestionId,
                isCorrect: true,
            },
        });

        await request(app)
            .post(`/rounds/${r1Id}/answer`)
            .set("Authorization", `Bearer ${bob.sessionToken}`)
            .send({ optionId: r1Correct.id });

        await aliceSock2.close();
        await new Promise((r) => setTimeout(r, 80));
        await presenceRegistry.whenIdle(alice.player.id);

        expect(presenceRegistry.getActiveSocketCount(alice.player.id)).toBe(0);
        expect(presenceRegistry.getPlayerPresence(alice.player.id)).toBe("DISCONNECTED");

        // Banco registra janela de 60s e mantém status ACTIVE e rodada OPEN (Alice segue elegível)
        const aliceDisconnected = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: alice.player.id },
        });
        expect(aliceDisconnected.status).toBe("ACTIVE");
        expect(aliceDisconnected.disconnectedAt).toBeInstanceOf(Date);
        expect(aliceDisconnected.reconnectDeadlineAt).toBeInstanceOf(Date);
        expect(
            aliceDisconnected.reconnectDeadlineAt!.getTime() -
                aliceDisconnected.disconnectedAt!.getTime(),
        ).toBe(60_000);

        expect(
            (await prisma.round.findUniqueOrThrow({ where: { id: r1Id } })).status,
        ).toBe("OPEN");

        // Reconexão dentro do prazo com o mesmo token: limpa timestamps, restaura ONLINE e não duplica jogador
        const aliceSock3 = await openPollingSocket(port, alice.sessionToken);
        await presenceRegistry.whenIdle(alice.player.id);

        expect(presenceRegistry.getPlayerPresence(alice.player.id)).toBe("ONLINE");
        expect(presenceRegistry.getActiveSocketCount(alice.player.id)).toBe(1);

        const aliceReconnected = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: alice.player.id },
        });
        expect(aliceReconnected.disconnectedAt).toBeNull();
        expect(aliceReconnected.reconnectDeadlineAt).toBeNull();

        const gamePlayers = await prisma.gamePlayer.findMany({
            where: { gameId: room.currentGame.id },
        });
        expect(gamePlayers).toHaveLength(2);

        // Alice reconectada consegue responder normalmente e fecha a rodada 1
        const aliceAnswerRes = await request(app)
            .post(`/rounds/${r1Id}/answer`)
            .set("Authorization", `Bearer ${alice.sessionToken}`)
            .send({ optionId: r1Correct.id });
        expect(aliceAnswerRes.status).toBe(201);
        expect(
            (await prisma.round.findUniqueOrThrow({ where: { id: r1Id } })).status,
        ).toBe("CLOSED");

        // Bob sai voluntariamente: socket é encerrado sem player:disconnected e reconexão via Socket.IO é bloqueada
        const bobLeaveRes = await request(app)
            .post("/rooms/leave")
            .set("Authorization", `Bearer ${bob.sessionToken}`);
        expect(bobLeaveRes.status).toBe(200);
        await new Promise((r) => setTimeout(r, 80));
        await presenceRegistry.whenIdle(bob.player.id);

        const bobAfterLeave = await prisma.gamePlayer.findUniqueOrThrow({
            where: { id: bob.player.id },
        });
        expect(bobAfterLeave.status).toBe("LEFT");
        expect(bobAfterLeave.disconnectedAt).toBeNull();

        await expect(
            openPollingSocket(port, bob.sessionToken),
        ).rejects.toThrow(/SOCKET_AUTH_REJECTED/);

        await aliceSock3.close();
        await bobSock.close();
    });
});
