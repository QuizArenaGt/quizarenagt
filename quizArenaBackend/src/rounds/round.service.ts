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
    RoundNotFoundError,
    RoundNotReadyError,
} from "./round.errors.js";
import { emitRoomEvent } from "../realtime/room-events.js";

type RoundRepositoryContract = Pick<
    RoundRepository,
    "createNextRound" | "closeRound" | "findExpiredOpenRoundIds"
>;

export type CreateNextRoundResponse =
    | {
        finished: false;
        round: RoundWithQuestion;
    }
    | {
        finished: true;
    };

export type RoundClosedWirePayload = {
    round: {
        id: string;
        roundNumber: number;
        status: "OPEN" | "CLOSED";
        openedAt: Date;
        expiresAt: Date;
        closedAt: Date | null;
        question: {
            id: string;
            statement: string;
            options: {
                id: string;
                text: string;
                isCorrect: boolean;
            }[];
        };
        answers: {
            id: string;
            player: {
                id: string;
                nickname: string;
            };
            option: {
                id: string;
                text: string;
            };
            isCorrect: boolean;
            points: number;
            answeredAt: Date;
        }[];
        unansweredPlayers: {
            id: string;
            nickname: string;
        }[];
        ranking: {
            id: string;
            nickname: string;
            score: number;
        }[];
    };
};

export function buildRoundStartedPayload(round: RoundWithQuestion) {
    return {
        finished: false as const,
        round: {
            id: round.id,
            roundNumber: round.roundNumber,
            status: round.status,
            openedAt: round.openedAt,
            expiresAt: round.expiresAt,
            timeLimit: round.timeLimit,
            question: {
                id: round.snapshotQuestion.id,
                statement: round.snapshotQuestion.statement,
                type: round.snapshotQuestion.type,
                position: round.snapshotQuestion.position,
                options: round.snapshotQuestion.options.map((option) => ({
                    id: option.id,
                    text: option.text,
                    position: option.position,
                })),
            },
        },
    };
}

export type RoundClosedSource = {
    id: string;
    roundNumber: number;
    status: "OPEN" | "CLOSED";
    openedAt: Date;
    expiresAt?: Date | null;
    closedAt: Date | null;
    timeLimit: number;
    snapshotQuestion: {
        id: string;
        statement: string;
        options: {
            id: string;
            text: string;
            isCorrect: boolean;
        }[];
    };
    answers: {
        id: string;
        isCorrect: boolean;
        points: number;
        answeredAt: Date;
        gamePlayer: {
            id: string;
            nickname: string;
        };
        option: {
            id: string;
            text: string;
        };
    }[];
};

export function buildRoundClosedPayload(
    round: RoundClosedSource,
    players: { id: string; nickname: string; score: number }[],
): RoundClosedWirePayload {
    const answeredPlayerIds = new Set(
        round.answers.map((answer) => answer.gamePlayer.id),
    );

    const ranking = [...players]
        .sort((a, b) => b.score - a.score)
        .map((player) => ({
            id: player.id,
            nickname: player.nickname,
            score: player.score,
        }));

    return {
        round: {
            id: round.id,
            roundNumber: round.roundNumber,
            status: round.status,
            openedAt: round.openedAt,
            expiresAt:
                round.expiresAt ??
                new Date(round.openedAt.getTime() + round.timeLimit * 1000),
            closedAt: round.closedAt,
            question: {
                id: round.snapshotQuestion.id,
                statement: round.snapshotQuestion.statement,
                options: round.snapshotQuestion.options.map((option) => ({
                    id: option.id,
                    text: option.text,
                    isCorrect: option.isCorrect,
                })),
            },
            answers: round.answers.map((answer) => ({
                id: answer.id,
                player: {
                    id: answer.gamePlayer.id,
                    nickname: answer.gamePlayer.nickname,
                },
                option: {
                    id: answer.option.id,
                    text: answer.option.text,
                },
                isCorrect: answer.isCorrect,
                points: answer.points,
                answeredAt: answer.answeredAt,
            })),
            unansweredPlayers: players
                .filter((player) => !answeredPlayerIds.has(player.id))
                .map((player) => ({
                    id: player.id,
                    nickname: player.nickname,
                })),
            ranking,
        },
    };
}

export class RoundService {
    constructor(
        private readonly roundRepository: RoundRepositoryContract =
            new RoundRepository(),
        private readonly emitEvent: typeof emitRoomEvent = emitRoomEvent,
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

    async closeRound(roundId: string, hostId: string) {
        const result = await this.roundRepository.closeRound(
            roundId,
            hostId,
            { allowBeforeExpiration: true },
        );

        if (result.success) {
            const payload = buildRoundClosedPayload(
                result.round,
                result.round.game.players,
            );

            if (!result.alreadyClosed) {
                this.emitEvent(
                    result.round.game.roomId,
                    "round:closed",
                    payload,
                );

                if (result.gameFinished) {
                    this.emitEvent(
                        result.round.game.roomId,
                        "game:finished",
                        {
                            roomId: result.round.game.roomId,
                        },
                    );
                }
            }

            return {
                round: result.round,
                alreadyClosed: result.alreadyClosed,
                gameFinished: result.gameFinished,
                payload,
            };
        }

        switch (result.reason) {
            case "ROUND_NOT_FOUND":
                throw new RoundNotFoundError();

            case "ACCESS_DENIED":
                throw new RoundAccessDeniedError();

            case "GAME_NOT_IN_PROGRESS":
                throw new RoundRoomNotInProgressError();

            case "ROUND_NOT_READY":
                throw new RoundNotReadyError();
        }
    }

    async tryCloseRoundIfReady(roundId: string) {
        const result = await this.roundRepository.closeRound(roundId);

        if (!result.success) {
            return null;
        }

        const payload = buildRoundClosedPayload(
            result.round,
            result.round.game.players,
        );

        if (!result.alreadyClosed) {
            this.emitEvent(
                result.round.game.roomId,
                "round:closed",
                payload,
            );

            if (result.gameFinished) {
                this.emitEvent(
                    result.round.game.roomId,
                    "game:finished",
                    {
                        roomId: result.round.game.roomId,
                    },
                );
            }
        }

        return {
            round: result.round,
            alreadyClosed: result.alreadyClosed,
            gameFinished: result.gameFinished,
            payload,
        };
    }

    async processExpiredRounds(): Promise<number> {
        const expiredIds = await this.roundRepository.findExpiredOpenRoundIds();
        let closedCount = 0;

        for (const roundId of expiredIds) {
            const result = await this.tryCloseRoundIfReady(roundId);
            if (result && !result.alreadyClosed) {
                closedCount += 1;
            }
        }

        return closedCount;
    }
}
