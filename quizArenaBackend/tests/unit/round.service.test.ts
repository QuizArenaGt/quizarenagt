
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    RoundService,
    buildRoundClosedPayload,
    type CreateNextRoundResponse,
} from "../../src/rounds/round.service.js";

import {
    RoundRoomNotFoundError,
    RoundAccessDeniedError,
    RoundRoomNotInProgressError,
    RoundGameNotFoundError,
    RoundAlreadyOpenError,
    PreviousRoundNotClosedError,
} from "../../src/rounds/round.errors.js";

import type { RoundRepository } from "../../src/rounds/round.repository.js";


const roundFixture = {
    id: "round-test-uuid",
    gameId: "game-test-uuid",
    snapshotQuestionId: "snapshot-question-1",
    roundNumber: 1,
    status: "OPEN" as const,
    openedAt: new Date("2026-11-16T12:00:00.000Z"),
    closedAt: null,
    timeLimit: 30,
    snapshotQuestion: {
        id: "snapshot-question-1",
        sourceQuestionId: "source-question-1",
        statement: "Pergunta 1",
        type: "MULTIPLE_CHOICE" as const,
        position: 0,
        snapshotId: "snapshot-test-uuid",
        options: [
            {
                id: "option-1",
                sourceOptionId: "source-option-1",
                questionSnapshotId: "snapshot-question-1",
                text: "Alternativa 1",
                isCorrect: true,
                position: 0,
            },
        ],
    },
};


describe("RoundService", () => {
    let service: RoundService;

    const repositoryMock = {
        createNextRound: vi.fn(),
        closeRound: vi.fn(),
        findExpiredOpenRoundIds: vi.fn(),
    };

    const emitMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        service = new RoundService(
            repositoryMock as unknown as RoundRepository,
            emitMock,
        );
    });

    describe("createNextRound", () => {
        it("deve retornar a rodada criada", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: true,
                round: roundFixture,
            });

            const result = await service.createNextRound(
                "room-test-uuid",
                "host-test-uuid",
            );

            expect(repositoryMock.createNextRound).toHaveBeenCalledWith(
                "room-test-uuid",
                "host-test-uuid",
            );

            expect(result).toEqual({
                finished: false,
                round: roundFixture,
            } satisfies CreateNextRoundResponse);
        });

        it("deve retornar finished quando o deck terminar", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "DECK_FINISHED",
            });

            const result = await service.createNextRound(
                "room-test-uuid",
                "host-test-uuid",
            );

            expect(result).toEqual({
                finished: true,
            });
        });

        it("deve lançar RoundRoomNotFoundError", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });

            await expect(
                service.createNextRound("room-test-uuid", "host-test-uuid"),
            ).rejects.toThrow(RoundRoomNotFoundError);
        });

        it("deve lançar RoundAccessDeniedError", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "ACCESS_DENIED",
            });

            await expect(
                service.createNextRound("room-test-uuid", "host-test-uuid"),
            ).rejects.toThrow(RoundAccessDeniedError);
        });

        it("deve lançar RoundRoomNotInProgressError", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "ROOM_NOT_IN_PROGRESS",
            });

            await expect(
                service.createNextRound("room-test-uuid", "host-test-uuid"),
            ).rejects.toThrow(RoundRoomNotInProgressError);
        });

        it("deve lançar RoundGameNotFoundError", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "GAME_NOT_FOUND",
            });

            await expect(
                service.createNextRound("room-test-uuid", "host-test-uuid"),
            ).rejects.toThrow(RoundGameNotFoundError);
        });

        it("deve lançar RoundAlreadyOpenError", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "ROUND_ALREADY_OPEN",
            });

            await expect(
                service.createNextRound("room-test-uuid", "host-test-uuid"),
            ).rejects.toThrow(RoundAlreadyOpenError);
        });

        it("deve lançar PreviousRoundNotClosedError", async () => {
            repositoryMock.createNextRound.mockResolvedValue({
                success: false,
                reason: "PREVIOUS_ROUND_NOT_CLOSED",
            });

            await expect(
                service.createNextRound("room-test-uuid", "host-test-uuid"),
            ).rejects.toThrow(PreviousRoundNotClosedError);
        });
    });

    describe("closeRound & tryCloseRoundIfReady", () => {
        it("closeRound (manual) deve autorizar allowBeforeExpiration true e emitir round:closed", async () => {
            const closedRound = {
                ...roundFixture,
                status: "CLOSED" as const,
                closedAt: new Date("2026-11-20T16:30:05.000Z"),
                expiresAt: new Date("2026-11-20T16:30:30.000Z"),
                game: {
                    roomId: "room-test-uuid",
                    players: [{ id: "gp-1", nickname: "Alice", status: "ACTIVE" as const, score: 130 }],
                },
                answers: [],
            };
            repositoryMock.closeRound.mockResolvedValueOnce({
                success: true,
                round: closedRound,
                alreadyClosed: false,
                gameFinished: false,
            });

            const res = await service.closeRound("round-test-uuid", "host-test-uuid");

            expect(repositoryMock.closeRound).toHaveBeenCalledWith(
                "round-test-uuid",
                "host-test-uuid",
                { allowBeforeExpiration: true },
            );
            expect(emitMock).toHaveBeenCalledWith(
                "room-test-uuid",
                "round:closed",
                expect.objectContaining({
                    round: expect.objectContaining({ id: "round-test-uuid", status: "CLOSED" }),
                }),
            );
            expect(res.alreadyClosed).toBe(false);
        });

        it("tryCloseRoundIfReady (automático) não passa allowBeforeExpiration e retorna null quando ROUND_NOT_READY", async () => {
            repositoryMock.closeRound.mockResolvedValueOnce({
                success: false,
                reason: "ROUND_NOT_READY",
            });

            const res = await service.tryCloseRoundIfReady("round-test-uuid");

            expect(repositoryMock.closeRound).toHaveBeenCalledWith("round-test-uuid");
            expect(emitMock).not.toHaveBeenCalled();
            expect(res).toBeNull();
        });

        it("buildRoundClosedPayload deve incluir apenas ACTIVE (inclusive desconectado dentro da janela de 60s) no ranking competitivo e excluir LEFT e ABANDONED sem alterar dados originais", () => {
            const closedRound = {
                ...roundFixture,
                status: "CLOSED" as const,
                closedAt: new Date("2026-11-20T16:30:10.000Z"),
                expiresAt: new Date("2026-11-20T16:30:30.000Z"),
                answers: [
                    {
                        id: "ans-1",
                        isCorrect: true,
                        points: 120,
                        answeredAt: new Date("2026-11-20T16:00:05.000Z"),
                        gamePlayer: { id: "gp-1", nickname: "Alice" },
                        option: { id: "option-1", text: "Alternativa 1" },
                    },
                ],
            };

            const players = [
                {
                    id: "gp-1",
                    nickname: "Alice",
                    status: "ACTIVE" as const,
                    score: 120,
                },
                {
                    id: "gp-2",
                    nickname: "Bob",
                    status: "ACTIVE" as const,
                    score: 150,
                    disconnectedAt: new Date("2026-11-20T16:30:00.000Z"),
                    reconnectDeadlineAt: new Date("2026-11-20T16:31:00.000Z"),
                },
                {
                    id: "gp-3",
                    nickname: "Carol",
                    status: "LEFT" as const,
                    score: 200,
                },
                {
                    id: "gp-4",
                    nickname: "Dave",
                    status: "ABANDONED" as const,
                    score: 90,
                },
            ];

            const payload = buildRoundClosedPayload(closedRound, players);

            expect(payload.round.unansweredPlayers).toEqual([
                { id: "gp-2", nickname: "Bob", avatarId: "explorer" },
            ]);
            expect(payload.round.ranking).toEqual([
                { id: "gp-2", nickname: "Bob", avatarId: "explorer", score: 150 },
                { id: "gp-1", nickname: "Alice", avatarId: "explorer", score: 120 },
            ]);
            // Dados históricos de LEFT e ABANDONED não foram modificados
            expect(players[2]?.score).toBe(200);
            expect(players[3]?.score).toBe(90);
        });
    });
});
