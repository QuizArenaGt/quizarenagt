import { apiRequest } from './api.ts';
import { normalizeRoomCode } from '../models/game.ts';
import { mapBackendRoomStatus, type Room } from '../models/room.ts';
import type {
    BackendRoomStatus,
    GameMode,
    LobbyPlayerDto,
    RoundClosedPayload,
    RoundStartedPayload,
} from './socket.ts';

export interface ApiRoom {
    id: string;
    code: string;
    hostId: string;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    status: BackendRoomStatus;
    createdAt: string;
    updatedAt: string;
}

export interface ApiRoomLobby {
    id: string;
    code: string;
    status: BackendRoomStatus;
    gameMode: GameMode;
    maxPlayers: number;
    questionTime: number;
    createdAt: string;
    host: {
        id: string;
        name: string;
    };
    players: LobbyPlayerDto[];
    playerCount: number;
}

export interface JoinRoomApiResponse {
    player: {
        id: string;
        roomId: string;
        userId: string | null;
        nickname: string;
        score: number;
        joinedAt: string;
    };
    sessionToken: string;
}

export type CreateNextRoundApiResponse =
    | {
          finished: true;
          message: string;
      }
    | RoundStartedPayload;

export interface SubmitAnswerApiResponse {
    answer: {
        id: string;
        roundId: string;
        answeredAt: string;
    };
}

export function mapApiRoomToModel(
    apiRoom: ApiRoom | ApiRoomLobby,
    meta?: { name?: string; theme?: string; questionIds?: string[] },
): Room {
    const players = 'players' in apiRoom ? apiRoom.players : [];
    return {
        id: apiRoom.id,
        code: apiRoom.code,
        name: meta?.name?.trim() || `Sala ${apiRoom.code}`,
        theme: meta?.theme?.trim() || 'Geral',
        timeLimit: apiRoom.questionTime,
        maxPlayers: apiRoom.maxPlayers,
        gameMode: apiRoom.gameMode,
        status: mapBackendRoomStatus(apiRoom.status),
        backendStatus: apiRoom.status,
        questionIds: meta?.questionIds ?? [],
        players,
    };
}

export function isValidApiRoom(value: unknown): value is ApiRoom {
    if (typeof value !== 'object' || value === null) return false;
    const room = value as Record<string, unknown>;
    return (
        typeof room.id === 'string' &&
        room.id.trim().length > 0 &&
        typeof room.code === 'string' &&
        /^[A-Z0-9]{6}$/i.test(room.code.trim()) &&
        typeof room.maxPlayers === 'number' &&
        typeof room.questionTime === 'number' &&
        typeof room.status === 'string'
    );
}

export async function createRoomApi(input: {
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
}): Promise<ApiRoom> {
    const response = await apiRequest<ApiRoom>('/rooms', {
        method: 'POST',
        body: JSON.stringify(input),
    });

    if (!isValidApiRoom(response)) {
        throw new Error('Resposta inválida ao criar sala.');
    }

    return response;
}

export async function updateRoomApi(
    roomId: string,
    input: {
        maxPlayers?: number;
        questionTime?: number;
        gameMode?: GameMode;
    },
): Promise<ApiRoom> {
    const response = await apiRequest<ApiRoom>(`/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
    });

    if (!isValidApiRoom(response)) {
        throw new Error('Resposta inválida ao atualizar sala.');
    }

    return response;
}

export async function getRoomLobbyApi(
    code: string,
    token?: string,
): Promise<ApiRoomLobby> {
    const cleanCode = normalizeRoomCode(code);
    const response = await apiRequest<{ room: ApiRoomLobby }>(`/rooms/${cleanCode}`, {
        method: 'GET',
        ...(token ? { token } : {}),
    });
    return response.room;
}

export async function joinRoomApi(input: {
    code: string;
    nickname: string;
}): Promise<JoinRoomApiResponse> {
    return apiRequest<JoinRoomApiResponse>('/rooms/join', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
            code: normalizeRoomCode(input.code),
            nickname: input.nickname.trim(),
        }),
    });
}

export async function startRoomApi(roomId: string): Promise<ApiRoom> {
    return apiRequest<ApiRoom>(`/rooms/${roomId}/start`, {
        method: 'POST',
    });
}

export async function createNextRoundApi(
    roomId: string,
): Promise<CreateNextRoundApiResponse> {
    return apiRequest<CreateNextRoundApiResponse>(`/rooms/${roomId}/rounds`, {
        method: 'POST',
    });
}

export async function closeRoundApi(roundId: string): Promise<RoundClosedPayload> {
    return apiRequest<RoundClosedPayload>(`/rounds/${roundId}/close`, {
        method: 'POST',
    });
}

export async function submitRoundAnswerApi(
    roundId: string,
    optionId: string,
    sessionToken: string,
): Promise<SubmitAnswerApiResponse> {
    return apiRequest<SubmitAnswerApiResponse>(`/rounds/${roundId}/answer`, {
        method: 'POST',
        token: sessionToken,
        body: JSON.stringify({ optionId }),
    });
}
