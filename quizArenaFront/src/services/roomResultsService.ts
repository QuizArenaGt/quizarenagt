import type { PlayerResult, RoomResults } from '../models/roomReport';
import type { RoundClosedPayload } from './socket';

type ResultsStore = Record<string, RoomResults>;

const memoryStore: ResultsStore = {};

export function loadRoomResults(roomId: string): RoomResults | null {
    return memoryStore[roomId] ?? null;
}

export function loadAllRoomResults(): Record<string, RoomResults> {
    return { ...memoryStore };
}

export function recordRoundClosedResult(
    roomId: string,
    payload: RoundClosedPayload,
): void {
    const { round } = payload;
    const questionId = round.question.id;

    const existing: RoomResults = memoryStore[roomId] ?? {
        questionIds: [],
        questionStatements: {},
        simulatedPlayers: [],
        players: [],
    };

    if (!existing.questionIds.includes(questionId)) {
        existing.questionIds.push(questionId);
    }

    const statement = round.question.statement?.trim();
    if (statement) {
        existing.questionStatements = {
            ...(existing.questionStatements ?? {}),
            [questionId]: statement,
        };
    }

    const allParticipants = new Map<
        string,
        { nickname: string; isCorrect: boolean; points: number }
    >();

    for (const ans of round.answers) {
        allParticipants.set(ans.player.nickname, {
            nickname: ans.player.nickname,
            isCorrect: ans.isCorrect,
            points: ans.points,
        });
    }

    for (const unanswered of round.unansweredPlayers) {
        if (!allParticipants.has(unanswered.nickname)) {
            allParticipants.set(unanswered.nickname, {
                nickname: unanswered.nickname,
                isCorrect: false,
                points: 0,
            });
        }
    }

    for (const [nickname, outcome] of allParticipants.entries()) {
        let playerResult = existing.players.find((p) => p.nickname === nickname);
        if (!playerResult) {
            playerResult = {
                nickname,
                isSimulated: false,
                answers: [],
            };
            existing.players.push(playerResult);
        }

        const otherAnswers = playerResult.answers.filter(
            (a) => a.questionId !== questionId,
        );
        playerResult.answers = [
            ...otherAnswers,
            {
                questionId,
                isCorrect: outcome.isCorrect,
                points: outcome.points,
            },
        ];
    }

    memoryStore[roomId] = existing;
}

export function savePlayerResult(
    roomId: string,
    result: PlayerResult,
    questionStatements?: Record<string, string>,
): void {
    const existing: RoomResults = memoryStore[roomId] ?? {
        questionIds: result.answers.map((a) => a.questionId),
        questionStatements: {},
        simulatedPlayers: [],
        players: [],
    };

    if (questionStatements) {
        existing.questionStatements = {
            ...(existing.questionStatements ?? {}),
            ...questionStatements,
        };
    }

    existing.players = [
        ...existing.players.filter((player) => player.nickname !== result.nickname),
        { ...result, isSimulated: false },
    ];
    memoryStore[roomId] = existing;
}

export function deleteRoomResults(roomId: string): void {
    delete memoryStore[roomId];
}

export function clearAllRoomResults(): void {
    for (const key of Object.keys(memoryStore)) {
        delete memoryStore[key];
    }
}
