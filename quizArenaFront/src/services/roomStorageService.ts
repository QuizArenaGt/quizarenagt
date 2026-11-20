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

export type ApiGameStatus = BackendRoomStatus;
export type ApiRoomLifecycleStatus = 'ACTIVE' | 'ARCHIVED';

export interface ApiGameRankingEntry {
    id: string;
    nickname: string;
    score: number;
    position: number;
    correctCount: number;
    wrongCount: number;
    answeredCount: number;
    joinedAt: string;
}

export interface ApiGameWinner {
    id: string;
    nickname: string;
    score: number;
}

export interface ApiGameHistoryItem {
    id: string;
    roomId: string;
    status: ApiGameStatus;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    durationMs: number | null;
    playerCount: number;
    winner: ApiGameWinner | null;
    ranking: ApiGameRankingEntry[];
}

export interface ApiGameQuestionResult {
    questionId: string;
    statement: string;
    position: number;
    roundNumber: number;
    roundStatus: 'OPEN' | 'CLOSED';
    answeredCount: number;
    correctCount: number;
    correctRate: number;
}

export interface ApiGameDetailedResults extends ApiGameHistoryItem {
    questionCount: number;
    questions: ApiGameQuestionResult[];
}

export interface ApiActiveRoundSummary {
    id: string;
    roundNumber: number;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    expiresAt: string;
    timeLimit: number;
    answeredCount: number;
    eligiblePlayerCount: number;
    answeredPlayers: {
        id: string;
        nickname: string;
    }[];
    question: RoundStartedPayload['round']['question'];
}

export interface ApiCompletedRoundSummary {
    id: string;
    roundNumber: number;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    expiresAt: string;
    closedAt: string | null;
}

export interface ApiGameSummary {
    id: string;
    status: ApiGameStatus;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    playerCount?: number;
    eligiblePlayerCount?: number;
    totalQuestions?: number;
    completedRoundsCount?: number;
    completedRounds?: ApiCompletedRoundSummary[];
    activeRound?: ApiActiveRoundSummary | null;
    lastClosedRound?: RoundClosedPayload['round'] | null;
    players?: LobbyPlayerDto[];
}

export interface ApiRoom {
    id: string;
    code: string;
    name?: string | null;
    theme?: string | null;
    hostId: string;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    status: BackendRoomStatus;
    roomStatus?: ApiRoomLifecycleStatus;
    archivedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ApiHostRoom extends ApiRoom {
    players?: LobbyPlayerDto[];
    currentGame?: ApiGameSummary;
}

export interface ApiRoomLobby {
    id: string;
    code: string;
    name?: string | null;
    theme?: string | null;
    status: BackendRoomStatus;
    roomStatus?: ApiRoomLifecycleStatus;
    archivedAt?: string | null;
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
    currentGame?: ApiGameSummary;
}

export interface ApiRoomAvailability {
    code: string;
    status: BackendRoomStatus;
    roomStatus?: ApiRoomLifecycleStatus;
    available: boolean;
}

export interface JoinRoomApiResponse {
    player: {
        id: string;
        gameId?: string;
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
    apiRoom: ApiRoom | ApiRoomLobby | ApiHostRoom,
    meta?: { name?: string; theme?: string; questionIds?: string[] },
): Room {
    const players =
        'players' in apiRoom && Array.isArray(apiRoom.players)
            ? apiRoom.players
            : 'currentGame' in apiRoom && Array.isArray(apiRoom.currentGame?.players)
              ? apiRoom.currentGame.players
              : [];
    const apiName = 'name' in apiRoom ? apiRoom.name : undefined;
    const apiTheme = 'theme' in apiRoom ? apiRoom.theme : undefined;
    const currentGameId =
        'currentGame' in apiRoom ? (apiRoom.currentGame?.id ?? null) : undefined;
    return {
        id: apiRoom.id,
        code: apiRoom.code,
        name: meta?.name?.trim() || apiName?.trim() || `Sala ${apiRoom.code}`,
        theme: meta?.theme?.trim() || apiTheme?.trim() || 'Geral',
        timeLimit: apiRoom.questionTime,
        maxPlayers: apiRoom.maxPlayers,
        gameMode: apiRoom.gameMode,
        status: mapBackendRoomStatus(apiRoom.status),
        backendStatus: apiRoom.status,
        ...(currentGameId !== undefined ? { currentGameId } : {}),
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
    name?: string | null;
    theme?: string | null;
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

export async function listHostRoomsApi(
    token?: string,
): Promise<ApiHostRoom[]> {
    const response = await apiRequest<{ rooms: unknown }>('/rooms', {
        method: 'GET',
        ...(token ? { token } : {}),
    });

    if (
        !response ||
        typeof response !== 'object' ||
        !Array.isArray((response as { rooms?: unknown }).rooms)
    ) {
        throw new Error('Resposta inválida ao listar salas.');
    }

    const rawRooms = (response as { rooms: unknown[] }).rooms;
    return rawRooms.filter(isValidApiRoom) as ApiHostRoom[];
}

export async function updateRoomApi(
    roomId: string,
    input: {
        name?: string | null;
        theme?: string | null;
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

export async function checkRoomAvailabilityApi(
    code: string,
): Promise<ApiRoomAvailability> {
    const cleanCode = normalizeRoomCode(code);
    const response = await apiRequest<{ room: ApiRoomAvailability }>(
        `/rooms/${encodeURIComponent(cleanCode)}/availability`,
        {
            method: 'GET',
            auth: false,
        },
    );

    if (
        !response ||
        typeof response !== 'object' ||
        !response.room ||
        typeof response.room.code !== 'string' ||
        typeof response.room.available !== 'boolean'
    ) {
        throw new Error('Não foi possível verificar a disponibilidade da sala.');
    }

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

export async function startRoomApi(roomId: string): Promise<ApiHostRoom> {
    return apiRequest<ApiHostRoom>(`/rooms/${roomId}/start`, {
        method: 'POST',
    });
}

export async function playAgainApi(roomId: string): Promise<ApiHostRoom> {
    const response = await apiRequest<ApiHostRoom>(`/rooms/${roomId}/play-again`, {
        method: 'POST',
    });

    if (!isValidApiRoom(response)) {
        throw new Error('Resposta inválida ao criar nova partida.');
    }

    return response;
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

export async function listRoomGamesApi(
    roomId: string,
): Promise<ApiGameHistoryItem[]> {
    const response = await apiRequest<{ games: unknown }>(
        `/rooms/${encodeURIComponent(roomId)}/games`,
        {
            method: 'GET',
        },
    );

    if (
        !response ||
        typeof response !== 'object' ||
        !Array.isArray((response as { games?: unknown }).games)
    ) {
        throw new Error('Resposta inválida ao consultar histórico de partidas.');
    }

    return (response as { games: ApiGameHistoryItem[] }).games;
}

export async function getGameResultsApi(
    roomId: string,
    gameId: string,
): Promise<ApiGameDetailedResults> {
    const response = await apiRequest<{ game?: unknown }>(
        `/rooms/${encodeURIComponent(roomId)}/games/${encodeURIComponent(gameId)}/results`,
        {
            method: 'GET',
        },
    );

    if (
        !response ||
        typeof response !== 'object' ||
        !response.game ||
        typeof (response.game as { id?: unknown }).id !== 'string'
    ) {
        throw new Error('Resposta inválida ao carregar resultados da partida.');
    }

    return response.game as ApiGameDetailedResults;
}
