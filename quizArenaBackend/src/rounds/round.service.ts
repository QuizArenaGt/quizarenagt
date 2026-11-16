
import {
    RoundRepository,
    type CreateNextRoundResult,
    type RoundWithQuestion,
} from "./round.repository.js";

import {
    RoundRoomNotFoundError,
    RoundAccessDeniedError,
    RoundRoomNotInProgressError,
    RoundGameNotFoundError,
    RoundAlreadyOpenError,
    PreviousRoundNotClosedError,
} from "./round.errors.js";

type RoundRepositoryContract = Pick<
    RoundRepository,
    "createNextRound"
>;

export type CreateNextRoundResponse =
    | {
        finished: false;
        round: RoundWithQuestion;
    }
    | {
        finished: true;
    };

export class RoundService {
    constructor(
        private readonly roundRepository: RoundRepositoryContract =
            new RoundRepository(),
    ) {}

    async createNextRound(
        roomId: string,
        hostId: string,
    ): Promise<CreateNextRoundResponse> {
        const result: CreateNextRoundResult =
            await this.roundRepository.createNextRound(
                roomId,
                hostId,
            );

        if (result.success) {
            return {
                finished: false,
                round: result.round,
            };
        }

        switch (result.reason) {
            case "ROOM_NOT_FOUND":
                throw new RoundRoomNotFoundError();

            case "ACCESS_DENIED":
                throw new RoundAccessDeniedError();

            case "ROOM_NOT_IN_PROGRESS":
                throw new RoundRoomNotInProgressError();

            case "GAME_NOT_FOUND":
                throw new RoundGameNotFoundError();

            case "ROUND_ALREADY_OPEN":
                throw new RoundAlreadyOpenError();

            case "PREVIOUS_ROUND_NOT_CLOSED":
                throw new PreviousRoundNotClosedError();

            case "DECK_FINISHED":
                return {
                    finished: true,
                };
        }
    }
}
