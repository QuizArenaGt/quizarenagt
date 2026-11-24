import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
    const txMock = {
        $queryRaw: vi.fn(),
        room: {
            findUnique: vi.fn(),
        },
        game: {
            update: vi.fn(),
        },
        round: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        gamePlayer: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        roundAnswer: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    };

    const prismaMock = {
        $queryRaw: vi.fn(),
        $transaction: vi.fn(
            async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
        ),
        round: {
            findMany: vi.fn(),
        },
        gamePlayer: {
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
    };

    return { prismaMock, txMock };
});

vi.mock("../../src/database/prisma.js", () => ({
    prisma: prismaMock,
}));

import {
    calibrateDbClockOffset,
    getServerNowMs,
    resetServerClockOffset,
} from "../../src/realtime/server-clock.js";
import { PlayerPresenceRegistry } from "../../src/realtime/player-presence.js";
import { PlayerAbandonmentRepository } from "../../src/rooms/player-abandonment.repository.js";
import { RoundAnswerRepository } from "../../src/round-answers/round-answer.repository.js";
import { RoundExpirationWorker } from "../../src/rounds/round-expiration.worker.js";
import { RoundRepository } from "../../src/rounds/round.repository.js";
import { RoundService } from "../../src/rounds/round.service.js";

describe("Ciclo de vida monotônico da rodada e abandono após alteração de Date.now()", () => {
    const baseDbMs = Date.parse("2026-11-24T12:00:00.000Z");
    let fakePerfNow = 10_000;
    let fakeDateNow = baseDbMs;

    beforeEach(async () => {
        vi.clearAllMocks();
        fakePerfNow = 10_000;
        fakeDateNow = baseDbMs;

        vi.spyOn(performance, "now").mockImplementation(() => fakePerfNow);
        vi.spyOn(Date, "now").mockImplementation(() => fakeDateNow);

        await calibrateDbClockOffset(
            async () => {
                fakePerfNow += 20; // midpoint em 10_010
                return new Date(baseDbMs);
            },
            () => fakePerfNow,
        );
        fakePerfNow = 10_010; // posiciona exatamente em baseDbMs
    });

    afterEach(() => {
        resetServerClockOffset();
        vi.restoreAllMocks();
    });

    it("mantém criação, pontuação, expiração pelo worker e rejeição ROUND_TIME_EXPIRED mesmo com Date.now() alterado para trás e para frente", async () => {
        const roundRepo = new RoundRepository();
        const answerRepo = new RoundAnswerRepository();
        const emittedEvents: Array<{ roomId: string; event: string; payload: unknown }> = [];
        const roundService = new RoundService(roundRepo, (roomId, event, payload) => {
            emittedEvents.push({ roomId, event, payload });
        });
        const worker = new RoundExpirationWorker(roundService, 1000, null);

        const questionFixture = {
            id: "snap-q-1",
            snapshotId: "snap-1",
            sourceQuestionId: "src-1",
            statement: "Pergunta 1",
            type: "MULTIPLE_CHOICE" as const,
            position: 0,
            options: [
                { id: "opt-ok", text: "Correta", isCorrect: true, position: 0 },
                { id: "opt-no", text: "Errada", isCorrect: false, position: 1 },
            ],
        };

        txMock.room.findUnique.mockResolvedValue({
            id: "room-1",
            hostId: "host-1",
            status: "ACTIVE",
            games: [
                {
                    id: "game-1",
                    roomId: "room-1",
                    status: "IN_PROGRESS",
                    questionTime: 30,
                    gameMode: "CLASSIC",
                    createdAt: new Date(baseDbMs - 60_000),
                    questionSnapshot: {
                        id: "snap-1",
                        questions: [questionFixture],
                    },
                    rounds: [],
                },
            ],
        });

        let persistedRound: {
            id: string;
            gameId: string;
            snapshotQuestionId: string;
            roundNumber: number;
            status: "OPEN" | "CLOSED";
            openedAt: Date;
            expiresAt: Date;
            closedAt: Date | null;
            timeLimit: number;
        } | null = null;

        txMock.round.create.mockImplementation(
            async (args: {
                data: {
                    gameId: string;
                    snapshotQuestionId: string;
                    roundNumber: number;
                    openedAt: Date;
                    expiresAt: Date;
                    timeLimit: number;
                };
            }) => {
                persistedRound = {
                    id: "round-1",
                    ...args.data,
                    status: "OPEN",
                    closedAt: null,
                };
                return {
                    ...persistedRound,
                    snapshotQuestion: questionFixture,
                };
            },
        );

        const created = await roundRepo.createNextRound("room-1", "host-1");
        expect(created.success).toBe(true);
        expect(persistedRound).not.toBeNull();
        expect(persistedRound!.openedAt.getTime()).toBe(baseDbMs);
        expect(persistedRound!.expiresAt.getTime()).toBe(baseDbMs + 30_000);

        // Altera abruptamente o relógio do sistema 1 hora para TRÁS aos 5s de rodada
        fakeDateNow = baseDbMs - 3_600_000;
        fakePerfNow += 15_000; // 15s monotônicos decorridos -> metade da rodada (15s restantes)

        // Worker consulta expiração com getServerNowDate(), NÃO com Date.now() nem NOW()
        prismaMock.round.findMany.mockImplementation(
            async (args: { where: { expiresAt: { lte: Date } } }) => {
                return persistedRound &&
                    persistedRound.status === "OPEN" &&
                    persistedRound.expiresAt.getTime() <= args.where.expiresAt.lte.getTime()
                    ? [{ id: persistedRound.id }]
                    : [];
            },
        );

        // Aos 15s monotônicos, ainda não expirou
        expect(await worker.runCycle()).toBe(0);

        // Resposta dentro do prazo (aos 15s) deve ser aceita com 100 + round(100 * 0.5) = 150 pontos
        txMock.round.findUnique.mockImplementation(async () => ({
            ...persistedRound!,
            game: {
                id: "game-1",
                roomId: "room-1",
                status: "IN_PROGRESS",
                gameMode: "CLASSIC",
                finishedAt: null,
                room: { id: "room-1", hostId: "host-1", status: "ACTIVE" },
                players: [
                    { id: "gp-1", nickname: "Alice", status: "ACTIVE", score: 0 },
                    { id: "gp-2", nickname: "Bob", status: "ACTIVE", score: 0 },
                ],
                questionSnapshot: { _count: { questions: 2 } },
                rounds: [{ id: persistedRound!.id, status: persistedRound!.status }],
            },
            snapshotQuestion: questionFixture,
            answers: [],
        }));
        txMock.gamePlayer.findUnique.mockResolvedValue({
            gameId: "game-1",
            status: "ACTIVE",
            reconnectDeadlineAt: null,
        });
        txMock.roundAnswer.findUnique.mockResolvedValue(null);
        txMock.roundAnswer.create.mockImplementation(
            async (args: {
                data: {
                    roundId: string;
                    gamePlayerId: string;
                    optionId: string;
                    isCorrect: boolean;
                    answeredAt: Date;
                    points: number;
                };
            }) => ({ id: "ans-1", ...args.data }),
        );

        const validAnswer = await answerRepo.submitAnswer(
            "round-1",
            "gp-1",
            "opt-ok",
        );
        expect(validAnswer.success).toBe(true);
        if (validAnswer.success) {
            expect(validAnswer.answer.points).toBe(150);
            expect(validAnswer.answer.answeredAt.getTime()).toBe(baseDbMs + 15_000);
        }

        // Altera Date.now() 2 horas para FRENTE aos 20s monotônicos — rodada NÃO deve expirar antes de 30s
        fakeDateNow = baseDbMs + 7_200_000;
        fakePerfNow += 5_000; // 20s monotônicos
        expect(getServerNowMs()).toBe(baseDbMs + 20_000);
        expect(await worker.runCycle()).toBe(0);

        // Volta Date.now() 3 horas para TRÁS e atinge 30s monotônicos (prazo original)
        fakeDateNow = baseDbMs - 10_800_000;
        fakePerfNow += 10_000; // 30s monotônicos exatos (expiresAt atingido)

        // Resposta exatamente no/após expiresAt deve receber ROUND_TIME_EXPIRED mesmo com Date.now() atrasado
        const lateAnswer = await answerRepo.submitAnswer(
            "round-1",
            "gp-2",
            "opt-ok",
        );
        expect(lateAnswer).toEqual({
            success: false,
            reason: "ROUND_TIME_EXPIRED",
        });

        // Worker detecta expiração aos 30s monotônicos, fecha a rodada e emite round:closed
        txMock.round.update.mockImplementation(
            async (args: { data: { status: "CLOSED"; closedAt: Date } }) => {
                persistedRound!.status = args.data.status;
                persistedRound!.closedAt = args.data.closedAt;
                return {
                    ...persistedRound!,
                    game: {
                        roomId: "room-1",
                        players: [
                            { id: "gp-1", nickname: "Alice", status: "ACTIVE", score: 125 },
                            { id: "gp-2", nickname: "Bob", status: "ACTIVE", score: 0 },
                        ],
                    },
                    snapshotQuestion: questionFixture,
                    answers: [],
                };
            },
        );

        const closedCount = await worker.runCycle();
        expect(closedCount).toBe(1);
        expect(persistedRound!.status).toBe("CLOSED");
        expect(persistedRound!.closedAt?.getTime()).toBe(baseDbMs + 30_000);
        expect(emittedEvents.some((e) => e.event === "round:closed")).toBe(true);
    });

    it("mantém controle temporal de abandono funcionando quando Date.now() recua ou avança", async () => {
        const abandonmentRepo = new PlayerAbandonmentRepository();
        const presencePersistence = {
            markDisconnected: vi.fn().mockResolvedValue(true),
            clearDisconnect: vi.fn().mockResolvedValue(true),
        };
        const registry = new PlayerPresenceRegistry({
            persistence: presencePersistence,
            emitEvent: vi.fn(),
        });

        registry.handleSocketConnected({
            playerId: "gp-disc",
            nickname: "Carol",
            gameId: "game-1",
            roomId: "room-1",
            socketId: "sock-1",
        });
        await registry.whenIdle("gp-disc");

        registry.handleSocketDisconnected({
            playerId: "gp-disc",
            nickname: "Carol",
            gameId: "game-1",
            roomId: "room-1",
            socketId: "sock-1",
        });
        await registry.whenIdle("gp-disc");

        const [, disconnectedAt, reconnectDeadlineAt] =
            presencePersistence.markDisconnected.mock.calls[0] as [
                string,
                Date,
                Date,
            ];
        expect(disconnectedAt.getTime()).toBe(baseDbMs);
        expect(reconnectDeadlineAt.getTime()).toBe(baseDbMs + 60_000);

        // Worker com intervalo de abandono de 5s continua disparando mesmo com Date.now() recuado -1h
        const processExpiredRounds = vi.fn().mockResolvedValue(0);
        const processExpiredAbandonments = vi.fn().mockResolvedValue(0);
        const worker = new RoundExpirationWorker(
            { processExpiredRounds },
            1000,
            { processExpiredAbandonments },
            5000,
        );

        await worker.runCycle();
        expect(processExpiredAbandonments).toHaveBeenCalledTimes(1);

        fakeDateNow = baseDbMs - 3_600_000;
        fakePerfNow += 5_000;
        await worker.runCycle();
        expect(processExpiredAbandonments).toHaveBeenCalledTimes(2);

        // PlayerAbandonmentRepository.findExpiredCandidateIds usa getServerNowDate()
        prismaMock.gamePlayer.findMany.mockImplementation(
            async (args: { where: { reconnectDeadlineAt: { lte: Date } } }) =>
                reconnectDeadlineAt.getTime() <=
                args.where.reconnectDeadlineAt.lte.getTime()
                    ? [{ id: "gp-disc" }]
                    : [],
        );

        expect(await abandonmentRepo.findExpiredCandidateIds()).toEqual([]);

        fakePerfNow += 55_000; // total +60s monotônicos
        expect(await abandonmentRepo.findExpiredCandidateIds()).toEqual([
            "gp-disc",
        ]);
    });
});
