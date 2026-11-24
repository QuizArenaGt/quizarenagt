import type { QuestionType } from './question.ts';
import {
    computeRemainingSecondsFromDeadline,
    extractHostMatchRecoveryState,
} from './room.ts';
import { normalizeRoomCode, isValidRoomCode, type RankingEntry } from './game.ts';
import type { ApiRoomLobby } from '../services/roomStorageService.ts';
import type {
    BackendRoomStatus,
    GameCreatedPayload,
    GameFinishedPayload,
    GameMode,
    GameStartedPayload,
    LobbyPlayerDto,
    PlayerJoinedPayload,
    PlayerLeftPayload,
    RoomUpdatedPayload,
    RoundAnswerSubmittedPayload,
    RoundClosedPayload,
    RoundClosedRankingEntryDto,
    RoundStartedPayload,
} from '../services/socket.ts';

export type ProjectionPhase =
    | 'waiting'
    | 'between_rounds'
    | 'round_open'
    | 'round_closed'
    | 'finished'
    | 'cancelled'
    | 'archived';

export type ProjectionSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ProjectionOpenOption {
    id: string;
    text: string;
    position: number;
}

export interface ProjectionActiveRound {
    id: string;
    roundNumber: number;
    openedAt: string;
    expiresAt?: string;
    timeLimit: number;
    question: {
        id: string;
        statement: string;
        type: QuestionType;
        position: number;
        options: ProjectionOpenOption[];
    };
}

export interface ProjectionClosedOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

export interface ProjectionClosedRound {
    id: string;
    roundNumber: number;
    question: {
        id: string;
        statement: string;
        type?: QuestionType;
        options: ProjectionClosedOption[];
    };
    answeredCount: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    ranking: RoundClosedRankingEntryDto[];
}

export interface ProjectionState {
    roomId: string;
    roomCode: string;
    roomName: string;
    roomTheme: string;
    gameMode: GameMode;
    timeLimit: number;
    maxPlayers: number;
    backendStatus: BackendRoomStatus;
    totalQuestions: number;
    players: LobbyPlayerDto[];
    activeRound: ProjectionActiveRound | null;
    closedRound: ProjectionClosedRound | null;
    answeredPlayerIds: string[];
    finalRanking: RankingEntry[];
    archived: boolean;
}

export interface ProjectionLoadError {
    kind: 'invalid_code' | 'auth' | 'forbidden' | 'not_found' | 'archived' | 'network';
    message: string;
}

export function buildProjectionRoute(code: string): string {
    const cleanCode = normalizeRoomCode(code);
    return isValidRoomCode(cleanCode)
        ? `/projetar/${encodeURIComponent(cleanCode)}`
        : '/dashboard';
}

function sanitizeOpenRound(round: RoundStartedPayload['round']): ProjectionActiveRound {
    return {
        id: round.id,
        roundNumber: round.roundNumber,
        openedAt: round.openedAt,
        expiresAt: round.expiresAt,
        timeLimit: round.timeLimit,
        question: {
            id: round.question.id,
            statement: round.question.statement,
            type: round.question.type,
            position: round.question.position,
            // Nunca inclui `isCorrect` durante a rodada aberta.
            options: round.question.options.map((option) => ({
                id: option.id,
                text: option.text,
                position: option.position,
            })),
        },
    };
}

function sanitizeClosedRound(
    round: RoundClosedPayload['round'],
    questionType?: QuestionType,
): ProjectionClosedRound {
    const answeredCount = round.answers.length;
    const correctCount = round.answers.filter((answer) => answer.isCorrect).length;
    const wrongCount = Math.max(0, answeredCount - correctCount);
    const unansweredCount = round.unansweredPlayers.length;

    return {
        id: round.id,
        roundNumber: round.roundNumber,
        question: {
            id: round.question.id,
            statement: round.question.statement,
            ...(questionType ? { type: questionType } : {}),
            options: round.question.options.map((option) => ({
                id: option.id,
                text: option.text,
                isCorrect: Boolean(option.isCorrect),
            })),
        },
        answeredCount,
        correctCount,
        wrongCount,
        unansweredCount,
        ranking: round.ranking,
    };
}

export function toProjectionRankingEntries(
    entries: readonly {
        id?: string;
        nickname: string;
        avatarId?: string;
        score: number;
        position?: number;
    }[],
): RankingEntry[] {
    return entries.map((entry, index) => ({
        position: typeof entry.position === 'number' ? entry.position : index + 1,
        nickname: entry.nickname,
        avatarId: entry.avatarId,
        score: entry.score,
        isCurrentPlayer: false,
    }));
}

function sortPlayersToRanking(players: readonly LobbyPlayerDto[]): RankingEntry[] {
    const active = players.filter((p) => p.status !== 'LEFT' && p.status !== 'ABANDONED');
    const source = active.length > 0 ? active : [...players];
    return [...source]
        .sort((a, b) => b.score - a.score || a.joinedAt.localeCompare(b.joinedAt))
        .map((player, index) => ({
            position: index + 1,
            nickname: player.nickname,
            avatarId: player.avatarId,
            score: player.score,
            isCurrentPlayer: false,
        }));
}

export function mapLobbyToProjectionState(lobby: ApiRoomLobby): ProjectionState {
    const recovered = extractHostMatchRecoveryState(lobby.currentGame);
    const players = Array.isArray(lobby.currentGame?.players)
        ? lobby.currentGame.players
        : Array.isArray(lobby.players)
          ? lobby.players
          : [];
    const backendStatus = lobby.currentGame?.status ?? lobby.status;
    const closedRound = recovered.closedRound ? sanitizeClosedRound(recovered.closedRound) : null;

    let finalRanking: RankingEntry[] = [];
    if (backendStatus === 'FINISHED') {
        finalRanking = closedRound?.ranking.length
            ? toProjectionRankingEntries(closedRound.ranking)
            : sortPlayersToRanking(players);
    }

    const resolvedName =
        typeof lobby.name === 'string' && lobby.name.trim().length > 0
            ? lobby.name.trim()
            : `Sala ${lobby.code}`;
    const resolvedTheme =
        typeof lobby.theme === 'string' && lobby.theme.trim().length > 0
            ? lobby.theme.trim()
            : 'Geral';

    return {
        roomId: lobby.id,
        roomCode: normalizeRoomCode(lobby.code),
        roomName: resolvedName,
        roomTheme: resolvedTheme,
        gameMode: lobby.currentGame?.gameMode ?? lobby.gameMode,
        timeLimit: lobby.currentGame?.questionTime ?? lobby.questionTime,
        maxPlayers: lobby.currentGame?.maxPlayers ?? lobby.maxPlayers,
        backendStatus,
        totalQuestions: lobby.currentGame?.totalQuestions ?? 0,
        players,
        activeRound: recovered.activeRound ? sanitizeOpenRound(recovered.activeRound) : null,
        closedRound,
        answeredPlayerIds: recovered.answeredPlayers.map((player) => player.id),
        finalRanking,
        archived: lobby.roomStatus === 'ARCHIVED',
    };
}

export function deriveProjectionPhase(state: ProjectionState): ProjectionPhase {
    if (state.archived) {
        return 'archived';
    }
    if (state.backendStatus === 'CANCELLED') {
        return 'cancelled';
    }
    if (state.backendStatus === 'FINISHED') {
        return 'finished';
    }
    if (state.backendStatus === 'WAITING') {
        return 'waiting';
    }
    if (state.activeRound) {
        return 'round_open';
    }
    if (state.closedRound) {
        return 'round_closed';
    }
    return 'between_rounds';
}

export function applyProjectionPlayerJoined(
    state: ProjectionState,
    payload: PlayerJoinedPayload,
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    const exists = state.players.some((player) => player.id === payload.player.id);
    const players = exists
        ? state.players.map((player) => (player.id === payload.player.id ? payload.player : player))
        : [...state.players, payload.player];

    return { ...state, players };
}

export function applyProjectionPlayerLeft(
    state: ProjectionState,
    payload: PlayerLeftPayload,
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    const players =
        payload.gameStatus === 'WAITING'
            ? state.players.filter((player) => player.id !== payload.player.id)
            : state.players.map((player) =>
                  player.id === payload.player.id
                      ? { ...player, status: payload.player.status }
                      : player,
              );

    return {
        ...state,
        players,
        answeredPlayerIds: state.answeredPlayerIds.filter((id) => id !== payload.player.id),
    };
}

export function applyProjectionRoomUpdated(
    state: ProjectionState,
    payload: RoomUpdatedPayload,
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    return {
        ...state,
        maxPlayers: payload.maxPlayers,
        timeLimit: payload.questionTime,
        gameMode: payload.gameMode,
    };
}

export function applyProjectionGameStarted(
    state: ProjectionState,
    payload: GameStartedPayload,
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    return {
        ...state,
        backendStatus: payload.status,
        finalRanking: [],
    };
}

export function applyProjectionRoundStarted(
    state: ProjectionState,
    payload: RoundStartedPayload,
): ProjectionState {
    const isSameRound = state.activeRound?.id === payload.round.id;

    return {
        ...state,
        backendStatus: 'IN_PROGRESS',
        activeRound: sanitizeOpenRound(payload.round),
        closedRound: null,
        answeredPlayerIds: isSameRound ? state.answeredPlayerIds : [],
    };
}

export function applyProjectionAnswerSubmitted(
    state: ProjectionState,
    payload: RoundAnswerSubmittedPayload,
): ProjectionState {
    if (state.activeRound && payload.roundId !== state.activeRound.id) {
        return state;
    }

    if (state.answeredPlayerIds.includes(payload.player.id)) {
        return state;
    }

    return {
        ...state,
        answeredPlayerIds: [...state.answeredPlayerIds, payload.player.id],
    };
}

export function applyProjectionRoundClosed(
    state: ProjectionState,
    payload: RoundClosedPayload,
): ProjectionState {
    const closedRound = sanitizeClosedRound(payload.round, state.activeRound?.question.type);
    const updatedPlayers = state.players.map((player) => {
        const ranked = closedRound.ranking.find((entry) => entry.id === player.id);
        return ranked ? { ...player, score: ranked.score } : player;
    });

    return {
        ...state,
        backendStatus: 'IN_PROGRESS',
        activeRound: null,
        closedRound,
        players: updatedPlayers,
    };
}

export function applyProjectionGameFinished(
    state: ProjectionState,
    payload: GameFinishedPayload,
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    const nextBackendStatus: BackendRoomStatus =
        payload.status === 'CANCELLED' ? 'CANCELLED' : 'FINISHED';

    const updatedPlayers = Array.isArray(payload.ranking)
        ? state.players.map((player) => {
              const ranked = payload.ranking?.find((entry) => entry.id === player.id);
              return ranked ? { ...player, score: ranked.score } : player;
          })
        : state.players;

    let finalRanking: RankingEntry[] = [];
    if (nextBackendStatus === 'FINISHED') {
        if (Array.isArray(payload.ranking) && payload.ranking.length > 0) {
            finalRanking = toProjectionRankingEntries(payload.ranking);
        } else if (state.closedRound && state.closedRound.ranking.length > 0) {
            finalRanking = toProjectionRankingEntries(state.closedRound.ranking);
        } else {
            finalRanking = sortPlayersToRanking(updatedPlayers);
        }
    }

    return {
        ...state,
        backendStatus: nextBackendStatus,
        activeRound: null,
        closedRound: null,
        answeredPlayerIds: [],
        players: updatedPlayers,
        finalRanking,
    };
}

export function applyProjectionGameCreated(
    state: ProjectionState,
    payload: GameCreatedPayload,
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    return {
        ...state,
        backendStatus: payload.currentGame?.status ?? payload.status ?? 'WAITING',
        maxPlayers: payload.currentGame?.maxPlayers ?? payload.maxPlayers,
        timeLimit: payload.currentGame?.questionTime ?? payload.questionTime,
        gameMode: payload.currentGame?.gameMode ?? payload.gameMode,
        players: [],
        activeRound: null,
        closedRound: null,
        answeredPlayerIds: [],
        finalRanking: [],
    };
}

export function applyProjectionRoomArchived(
    state: ProjectionState,
    payload: { roomId: string },
): ProjectionState {
    if (payload.roomId !== state.roomId) {
        return state;
    }

    return {
        ...state,
        archived: true,
        activeRound: null,
        closedRound: null,
        answeredPlayerIds: [],
    };
}

export function formatProjectionLoadError(error: unknown): ProjectionLoadError {
    if (typeof error === 'object' && error !== null && 'status' in error) {
        const status = (error as { status?: unknown }).status;
        const rawMessage =
            'message' in error && typeof (error as { message?: unknown }).message === 'string'
                ? (error as { message: string }).message.trim()
                : '';

        if (status === 401) {
            return {
                kind: 'auth',
                message: 'Sua sessão de anfitrião expirou. Faça login novamente para abrir a projeção.',
            };
        }

        if (status === 403) {
            return {
                kind: 'forbidden',
                message: 'Você não tem permissão para projetar esta sala.',
            };
        }

        if (status === 404) {
            return {
                kind: 'not_found',
                message: 'Sala não encontrada. Verifique o código informado.',
            };
        }

        if (status === 409) {
            return {
                kind: 'archived',
                message: rawMessage || 'Esta sala foi arquivada e não está mais disponível para projeção.',
            };
        }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
        return {
            kind: 'network',
            message: error.message.trim(),
        };
    }

    return {
        kind: 'network',
        message: 'Não foi possível carregar os dados da sala para projeção.',
    };
}

export interface ExecuteLoadProjectionRoomParams {
    rawCode: string | undefined;
    fetchLobby: (cleanCode: string) => Promise<ApiRoomLobby>;
    nowMs?: number | null;
}

export type ExecuteLoadProjectionRoomResult =
    | {
          ok: true;
          state: ProjectionState;
          remainingSeconds: number | null;
      }
    | {
          ok: false;
          error: ProjectionLoadError;
      };

export async function executeLoadProjectionRoom({
    rawCode,
    fetchLobby,
    nowMs,
}: ExecuteLoadProjectionRoomParams): Promise<ExecuteLoadProjectionRoomResult> {
    const cleanCode = normalizeRoomCode(rawCode ?? '');
    if (!isValidRoomCode(cleanCode)) {
        return {
            ok: false,
            error: {
                kind: 'invalid_code',
                message: 'Código da sala inválido para projeção.',
            },
        };
    }

    try {
        const lobby = await fetchLobby(cleanCode);
        const state = mapLobbyToProjectionState(lobby);
        const remainingSeconds = state.activeRound
            ? computeRemainingSecondsFromDeadline(
                  state.activeRound.expiresAt,
                  state.activeRound.openedAt,
                  state.activeRound.timeLimit,
                  nowMs,
              )
            : 0;

        return {
            ok: true,
            state,
            remainingSeconds,
        };
    } catch (error) {
        return {
            ok: false,
            error: formatProjectionLoadError(error),
        };
    }
}
