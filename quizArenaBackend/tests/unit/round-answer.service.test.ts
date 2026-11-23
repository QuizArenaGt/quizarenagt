
import { describe, expect, it, vi } from "vitest";

import { RoundAnswerService } from "../../src/round-answers/round-answer.service.js";

import {
    RoundAnswerAlreadySubmittedError,
    RoundAnswerGameNotInProgressError,
    RoundAnswerOptionNotValidError,
    RoundAnswerPlayerNotInRoomError,
    RoundAnswerRoundNotFoundError,
    RoundAnswerRoundNotOpenError,
} from "../../src/round-answers/round-answer.errors.js";

import type { RoundAnswerRepository } from "../../src/round-answers/round-answer.repository.js";

describe("RoundAnswerService", () => {
    const answer = {
        id: "answer-id",
        roundId: "round-id",
        gamePlayerId: "player-id",
        optionId: "option-id",
        answeredAt: new Date("2026-11-16T19:00:00.000Z"),
        isCorrect: true,
    };

    function createService() {
        const repository = {
            submitAnswer: vi.fn(),
        };

        const service = new RoundAnswerService(
            repository as unknown as Pick<
                RoundAnswerRepository,
                "submitAnswer"
            >,
        );

        return { service, repository };
    }

    describe("submitAnswer", () => {
        it("deve retornar os dados da resposta registrada", async () => {
            const { service, repository } = createService();

            repository.submitAnswer.mockResolvedValue({
                success: true,
                answer,
            });

            await expect(
                service.submitAnswer(
                    "round-id",
                    "player-id",
                    "option-id",
                ),
            ).resolves.toEqual(answer);

            expect(repository.submitAnswer).toHaveBeenCalledWith(
                "round-id",
                "player-id",
                "option-id",
            );
        });

        it.each([
            ["ROUND_NOT_FOUND", RoundAnswerRoundNotFoundError],
            ["PLAYER_NOT_IN_ROOM", RoundAnswerPlayerNotInRoomError],
            ["PLAYER_INACTIVE", RoundAnswerPlayerNotInRoomError],
            ["ROUND_NOT_OPEN", RoundAnswerRoundNotOpenError],
            ["GAME_NOT_IN_PROGRESS", RoundAnswerGameNotInProgressError],
            ["OPTION_NOT_VALID", RoundAnswerOptionNotValidError],
            ["ALREADY_ANSWERED", RoundAnswerAlreadySubmittedError],
        ] as const)(
            "deve lançar o erro correto para %s",
            async (reason, ExpectedError) => {
                const { service, repository } = createService();

                repository.submitAnswer.mockResolvedValue({
                    success: false,
                    reason,
                });

                await expect(
                    service.submitAnswer(
                        "round-id",
                        "player-id",
                        "option-id",
                    ),
                ).rejects.toBeInstanceOf(ExpectedError);
            },
        );
    });
});
