import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { normalizeRoomCode } from '../models/game';
import type { QuestionType } from '../models/question';

export type GameMode = 'CLASSIC' | 'HARDCORE';
export type BackendRoomStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';

export interface RealtimeConnectedPayload {
    roomId: string;
    role: 'HOST' | 'PLAYER';
    playerId?: string;
    nickname?: string;
    userId?: string;
}

export interface RoomUpdatedPayload {
    roomId: string;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
}

export interface GameStartedPayload {
    roomId: string;
    status: BackendRoomStatus;
}

export type PlayerStatus = 'ACTIVE' | 'LEFT' | 'ABANDONED';
export type PlayerPresenceState = 'ONLINE' | 'DISCONNECTED' | 'RECONNECTING';

export interface PlayerConnectedPayload {
    roomId: string;
    gameId: string;
    player: {
        id: string;
        nickname: string;
        status: PlayerStatus;
    };
    presence: PlayerPresenceState;
    connectedAt: string;
}

export interface PlayerDisconnectedPayload {
    roomId: string;
    gameId: string;
    player: {
        id: string;
        nickname: string;
        status: PlayerStatus;
    };
    presence: PlayerPresenceState;
    disconnectedAt: string;
    reconnectDeadlineAt: string;
}

export interface PlayerReconnectedPayload {
    roomId: string;
    gameId: string;
    player: {
        id: string;
        nickname: string;
        status: PlayerStatus;
    };
    presence: PlayerPresenceState;
    reconnectedAt: string;
}

export interface LobbyPlayerDto {
    id: string;
    nickname: string;
    status?: PlayerStatus;
    score: number;
    joinedAt: string;
}

export interface PlayerJoinedPayload {
    roomId: string;
    player: LobbyPlayerDto;
}

export interface PlayerLeftPayload {
    roomId: string;
    gameId: string;
    gameStatus: BackendRoomStatus;
    player: {
        id: string;
        nickname: string;
        status: PlayerStatus;
        score: number;
    };
    eligiblePlayerCount: number;
}

export interface RoundStartedOptionDto {
    id: string;
    text: string;
    position: number;
}

export interface RoundStartedQuestionDto {
    id: string;
    statement: string;
    type: QuestionType;
    position: number;
    options: RoundStartedOptionDto[];
}

export interface RoundStartedPayload {
    finished: false;
    round: {
        id: string;
        roundNumber: number;
        status: 'OPEN' | 'CLOSED';
        openedAt: string;
        expiresAt?: string;
        timeLimit: number;
        question: RoundStartedQuestionDto;
    };
}

export interface RoundClosedAnswerDto {
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
    answeredAt: string;
}

export interface RoundClosedRankingEntryDto {
    id: string;
    nickname: string;
    score: number;
}

export interface RoundClosedPayload {
    round: {
        id: string;
        roundNumber: number;
        status: 'OPEN' | 'CLOSED';
        openedAt: string;
        expiresAt?: string;
        closedAt: string | null;
        question: {
            id: string;
            statement: string;
            options: {
                id: string;
                text: string;
                isCorrect: boolean;
            }[];
        };
        answers: RoundClosedAnswerDto[];
        unansweredPlayers: {
            id: string;
            nickname: string;
        }[];
        ranking: RoundClosedRankingEntryDto[];
    };
}

export interface RoundAnswerSubmittedPayload {
    roundId: string;
    player: {
        id: string;
        nickname: string;
    };
}

export interface GameFinishedRankingEntryDto {
    id: string;
    nickname: string;
    score: number;
    position?: number;
}

export interface GameFinishedPayload {
    roomId: string;
    gameId?: string;
    status?: BackendRoomStatus;
    reason?: string;
    finishedAt?: string;
    ranking?: GameFinishedRankingEntryDto[];
}

export interface GameCreatedPayload {
    roomId: string;
    status: BackendRoomStatus;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    currentGame?: {
        id: string;
        status: BackendRoomStatus;
        maxPlayers: number;
        questionTime: number;
        gameMode: GameMode;
    } | null;
}

export function createHostSocket(token: string, roomCode: string): Socket {
    return io(API_URL, {
        auth: {
            token,
            roomCode: normalizeRoomCode(roomCode),
        },
        transports: ['websocket', 'polling'],
    });
}

export function createPlayerSocket(sessionToken: string): Socket {
    return io(API_URL, {
        auth: {
            token: sessionToken,
        },
        transports: ['websocket', 'polling'],
    });
}
