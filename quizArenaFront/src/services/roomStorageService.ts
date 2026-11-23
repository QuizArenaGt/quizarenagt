import { apiRequest } from './api.ts';
import { normalizeRoomCode } from '../models/game.ts';
import { mapBackendRoomStatus, type Room } from '../models/room.ts';
import type {
    BackendRoomStatus,
    GameFinishedRankingEntryDto,
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
    answeredCount?: number;
    correctCount?: number;
    averageCorrectRate?: number | null;
    winner: ApiGameWinner | null;
    ranking: ApiGameRankingEntry[];
}

export interface ApiRoomAggregatedQuestionPerformance {
    questionKey: string;
    questionId: string;
    sourceQuestionId: string | null;
    statement: string;
    position: number;
    gamesPlayedCount: number;
    answeredCount: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    expectedAnswers: number;
    correctRate: number | null;
    errorRate?: number | null;
    overallCorrectRate: number | null;
}

export interface ApiRoomAggregatedStats {
    roomId: string;
    finishedGamesCount: number;
    totalParticipations: number;
    averagePlayersPerGame: number | null;
    averageScore: number | null;
    totalAnswers: number;
    totalCorrectAnswers: number;
    totalWrongAnswers?: number;
    averageCorrectRate: number | null;
    lastFinishedGameAt: string | null;
    hardestQuestions: ApiRoomAggregatedQuestionPerformance[];
    easiestQuestions: ApiRoomAggregatedQuestionPerformance[];
    questionPerformance: ApiRoomAggregatedQuestionPerformance[];
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
    activeQuestionsCount?: number;
    finishedGamesCount?: number;
    totalGamesCount?: number;
    lastGameFinishedAt?: string | null;
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
        status?: 'ACTIVE' | 'LEFT' | 'ABANDONED';
        score: number;
        joinedAt: string;
    };
    sessionToken: string;
}

export interface LeaveRoomApiResponse {
    message: string;
    roomId: string;
    gameId: string;
    gameStatus: BackendRoomStatus;
    player: {
        id: string;
        nickname: string;
        status: 'ACTIVE' | 'LEFT' | 'ABANDONED';
        score: number;
    };
    eligiblePlayerCount: number;
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
    const apiName =
        'name' in apiRoom && typeof apiRoom.name === 'string'
            ? apiRoom.name.trim()
            : '';
    const metaName = typeof meta?.name === 'string' ? meta.name.trim() : '';
    const apiTheme =
        'theme' in apiRoom && typeof apiRoom.theme === 'string'
            ? apiRoom.theme.trim()
            : '';
    const metaTheme = typeof meta?.theme === 'string' ? meta.theme.trim() : '';
    const currentGameId =
        'currentGame' in apiRoom ? (apiRoom.currentGame?.id ?? null) : undefined;
    const activeQuestionsCount =
        'activeQuestionsCount' in apiRoom && typeof apiRoom.activeQuestionsCount === 'number'
            ? apiRoom.activeQuestionsCount
            : undefined;
    const finishedGamesCount =
        'finishedGamesCount' in apiRoom && typeof apiRoom.finishedGamesCount === 'number'
            ? apiRoom.finishedGamesCount
            : undefined;
    const totalGamesCount =
        'totalGamesCount' in apiRoom && typeof apiRoom.totalGamesCount === 'number'
            ? apiRoom.totalGamesCount
            : undefined;
    const lastGameFinishedAt =
        'lastGameFinishedAt' in apiRoom ? (apiRoom.lastGameFinishedAt ?? null) : undefined;
    return {
        id: apiRoom.id,
        code: apiRoom.code,
        name: apiName || metaName || `Sala ${apiRoom.code}`,
        theme: apiTheme || metaTheme || 'Geral',
        timeLimit: apiRoom.questionTime,
        maxPlayers: apiRoom.maxPlayers,
        gameMode: apiRoom.gameMode,
        status: mapBackendRoomStatus(apiRoom.status),
        backendStatus: apiRoom.status,
        ...(currentGameId !== undefined ? { currentGameId } : {}),
        ...(activeQuestionsCount !== undefined ? { activeQuestionsCount } : {}),
        ...(finishedGamesCount !== undefined ? { finishedGamesCount } : {}),
        ...(totalGamesCount !== undefined ? { totalGamesCount } : {}),
        ...(lastGameFinishedAt !== undefined ? { lastGameFinishedAt } : {}),
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

export async function archiveRoomApi(roomId: string): Promise<ApiRoom | null> {
    const response = await apiRequest<{ message?: string; room?: ApiRoom }>(
        `/rooms/${encodeURIComponent(roomId)}`,
        {
            method: 'DELETE',
        },
    );

    if (response && typeof response === 'object' && 'room' in response && response.room) {
        if (!isValidApiRoom(response.room)) {
            throw new Error('Resposta inválida ao excluir sala.');
        }
        return response.room;
    }

    return null;
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

export async function leaveRoomApi(sessionToken: string): Promise<LeaveRoomApiResponse> {
    return apiRequest<LeaveRoomApiResponse>('/rooms/leave', {
        method: 'POST',
        token: sessionToken,
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

export interface FinishRoomApiResponse {
    message?: string;
    room: ApiHostRoom;
    ranking?: GameFinishedRankingEntryDto[];
    alreadyFinished?: boolean;
}

export async function finishRoomApi(roomId: string): Promise<FinishRoomApiResponse> {
    const response = await apiRequest<FinishRoomApiResponse>(
        `/rooms/${encodeURIComponent(roomId)}/finish`,
        {
            method: 'POST',
        },
    );

    if (!response || typeof response !== 'object' || !isValidApiRoom(response.room)) {
        throw new Error('Resposta inválida ao encerrar partida.');
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

export async function listRoomGamesWithStatsApi(
    roomId: string,
): Promise<{ games: ApiGameHistoryItem[]; stats: ApiRoomAggregatedStats | null }> {
    const response = await apiRequest<{ games: unknown; stats?: unknown }>(
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

    const rawStats = (response as { stats?: unknown }).stats;
    const stats =
        rawStats && typeof rawStats === 'object'
            ? (rawStats as ApiRoomAggregatedStats)
            : null;

    return {
        games: (response as { games: ApiGameHistoryItem[] }).games,
        stats,
    };
}

export async function listRoomGamesApi(
    roomId: string,
): Promise<ApiGameHistoryItem[]> {
    const { games } = await listRoomGamesWithStatsApi(roomId);
    return games;
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
