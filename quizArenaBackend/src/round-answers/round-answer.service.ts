
import {
    RoundAnswerRepository,
} from "./round-answer.repository.js";

import {
    RoundAnswerAlreadySubmittedError,
    RoundAnswerGameNotInProgressError,
    RoundAnswerOptionNotValidError,
    RoundAnswerPlayerNotInRoomError,
    RoundAnswerRoundNotFoundError,
    RoundAnswerRoundNotOpenError,
} from "./round-answer.errors.js";

type RoundAnswerRepositoryContract = Pick<
    RoundAnswerRepository,
    "submitAnswer"
>;

export class RoundAnswerService {
    constructor(
        private readonly roundAnswerRepository: RoundAnswerRepositoryContract =
            new RoundAnswerRepository(),
    ) {}

    async submitAnswer(
        roundId: string,
        roomPlayerId: string,
        optionId: string,
    ) {
        const result = await this.roundAnswerRepository.submitAnswer(
            roundId,
            roomPlayerId,
            optionId,
        );

        if (result.success) {
            return {
                id: result.answer.id,
                roundId: result.answer.roundId,
                roomPlayerId: result.answer.roomPlayerId,
                optionId: result.answer.optionId,
                answeredAt: result.answer.answeredAt,
                isCorrect: result.answer.isCorrect,
            };
        }

        switch (result.reason) {
            case "ROUND_NOT_FOUND":
                throw new RoundAnswerRoundNotFoundError();

            case "PLAYER_NOT_IN_ROOM":
                throw new RoundAnswerPlayerNotInRoomError();

            case "ROUND_NOT_OPEN":
                throw new RoundAnswerRoundNotOpenError();

            case "GAME_NOT_IN_PROGRESS":
                throw new RoundAnswerGameNotInProgressError();

            case "OPTION_NOT_VALID":
                throw new RoundAnswerOptionNotValidError();

            case "ALREADY_ANSWERED":
                throw new RoundAnswerAlreadySubmittedError();
        }
    }
}
