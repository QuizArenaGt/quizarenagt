
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    RoundService,
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
    };

    beforeEach(() => {
        vi.clearAllMocks();

        service = new RoundService(
            repositoryMock as unknown as RoundRepository,
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
});
