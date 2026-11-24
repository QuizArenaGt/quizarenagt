import { useCallback, useEffect, useRef, useState } from 'react';
import {
    applyProjectionAnswerSubmitted,
    applyProjectionGameCreated,
    applyProjectionGameFinished,
    applyProjectionGameStarted,
    applyProjectionPlayerJoined,
    applyProjectionPlayerLeft,
    applyProjectionRoomArchived,
    applyProjectionRoomUpdated,
    applyProjectionRoundClosed,
    applyProjectionRoundStarted,
    deriveProjectionPhase,
    executeLoadProjectionRoom,
    type ProjectionLoadError,
    type ProjectionPhase,
    type ProjectionSocketStatus,
    type ProjectionState,
} from '../models/projection';
import {
    computeRemainingSecondsFromDeadline,
    countEligiblePlayers,
} from '../models/room';
import { getRoomLobbyApi } from '../services/roomStorageService';
import { subscribeServerClock } from '../services/serverClock';
import {
    AUTH_TOKEN_UPDATED_EVENT,
    createHostSocket,
    isSocketAuthRejectionError,
    syncSocketClock,
    type GameCreatedPayload,
    type GameFinishedPayload,
    type GameStartedPayload,
    type PlayerJoinedPayload,
    type PlayerLeftPayload,
    type RoomUpdatedPayload,
    type RoundAnswerSubmittedPayload,
    type RoundClosedPayload,
    type RoundStartedPayload,
} from '../services/socket';

const TIMER_TICK_MS = 250;

export interface ProjectionViewModelResult {
    isLoading: boolean;
    loadError: ProjectionLoadError | null;
    socketStatus: ProjectionSocketStatus;
    socketError: string | null;
    state: ProjectionState | null;
    phase: ProjectionPhase | null;
    remainingSeconds: number | null;
    eligiblePlayerCount: number;
    retryLoad: () => void;
}

/**
 * ViewModel estritamente somente leitura da tela de projeção (/projetar/:code).
 * Sincroniza estado inicial via GET /rooms/:code e atualizações em tempo real via
 * createHostSocket + relógio monotônico do servidor, sem expor ações de controle.
 */
export function useProjectionViewModel(
    rawRoomCode: string | undefined,
): ProjectionViewModelResult {
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<ProjectionLoadError | null>(null);
    const [state, setState] = useState<ProjectionState | null>(null);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
    const [socketStatus, setSocketStatus] = useState<ProjectionSocketStatus>('connecting');
    const [socketError, setSocketError] = useState<string | null>(null);
    const [tokenRevision, setTokenRevision] = useState(0);

    const loadSeqRef = useRef(0);
    const socketRef = useRef<ReturnType<typeof createHostSocket> | null>(null);

    const loadRoomState = useCallback(
        async (options?: { silent?: boolean }) => {
            const seq = ++loadSeqRef.current;
            if (!options?.silent) {
                setIsLoading(true);
                setLoadError(null);
            }

            const result = await executeLoadProjectionRoom({
                rawCode: rawRoomCode,
                fetchLobby: (cleanCode) => getRoomLobbyApi(cleanCode),
            });

            if (seq !== loadSeqRef.current) {
                return;
            }

            if (result.ok) {
                setState(result.state);
                setRemainingSeconds(result.remainingSeconds);
                setLoadError(null);
            } else {
                if (!options?.silent) {
                    setState(null);
                    setRemainingSeconds(null);
                }
                setLoadError(result.error);
            }

            if (!options?.silent) {
                setIsLoading(false);
            }
        },
        [rawRoomCode],
    );

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            void loadRoomState();
        }, 0);
        return () => {
            window.clearTimeout(timerId);
            loadSeqRef.current += 1;
        };
    }, [loadRoomState]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleTokenUpdated = () => {
            setTokenRevision((revision) => revision + 1);
        };
        window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, handleTokenUpdated);
        return () => {
            window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, handleTokenUpdated);
        };
    }, []);

    const connectedRoomId = state?.roomId ?? null;
    const connectedRoomCode = state?.roomCode ?? null;
    const isRoomArchived = state?.archived ?? false;

    useEffect(() => {
        if (!connectedRoomId || !connectedRoomCode || isRoomArchived) {
            return;
        }

        const token =
            typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            const errTimer = window.setTimeout(() => {
                setSocketStatus('error');
                setSocketError('Autenticação necessária para conectar à sala.');
            }, 0);
            return () => window.clearTimeout(errTimer);
        }

        const socket = createHostSocket(token, connectedRoomCode);
        socketRef.current = socket;
        let hasConnectedOnce = false;

        socket.on('connect', () => {
            setSocketStatus('connected');
            setSocketError(null);
            void syncSocketClock(socket);
            if (!hasConnectedOnce) {
                hasConnectedOnce = true;
                return;
            }
            void loadRoomState({ silent: true });
        });

        socket.on('disconnect', () => {
            setSocketStatus('reconnecting');
        });

        socket.on('connect_error', (err) => {
            if (isSocketAuthRejectionError(err)) {
                setSocketStatus('error');
                setSocketError(err?.message || 'Acesso à sala não autorizado.');
                socket.disconnect();
                return;
            }
            setSocketStatus('reconnecting');
        });

        socket.on('player:joined', (payload: PlayerJoinedPayload) => {
            setState((current) =>
                current ? applyProjectionPlayerJoined(current, payload) : current,
            );
        });

        socket.on('player:left', (payload: PlayerLeftPayload) => {
            setState((current) =>
                current ? applyProjectionPlayerLeft(current, payload) : current,
            );
        });

        socket.on('room:updated', (payload: RoomUpdatedPayload) => {
            setState((current) =>
                current ? applyProjectionRoomUpdated(current, payload) : current,
            );
        });

        socket.on('game:started', (payload: GameStartedPayload) => {
            setState((current) =>
                current ? applyProjectionGameStarted(current, payload) : current,
            );
        });

        socket.on('round:started', (payload: RoundStartedPayload) => {
            setState((current) =>
                current ? applyProjectionRoundStarted(current, payload) : current,
            );
            setRemainingSeconds(
                computeRemainingSecondsFromDeadline(
                    payload.round.expiresAt,
                    payload.round.openedAt,
                    payload.round.timeLimit,
                ),
            );
        });

        socket.on('round:answer-submitted', (payload: RoundAnswerSubmittedPayload) => {
            setState((current) =>
                current ? applyProjectionAnswerSubmitted(current, payload) : current,
            );
        });

        socket.on('round:closed', (payload: RoundClosedPayload) => {
            setState((current) =>
                current ? applyProjectionRoundClosed(current, payload) : current,
            );
            setRemainingSeconds(0);
        });

        socket.on('game:finished', (payload: GameFinishedPayload) => {
            setState((current) =>
                current ? applyProjectionGameFinished(current, payload) : current,
            );
            setRemainingSeconds(0);
        });

        socket.on('game:created', (payload: GameCreatedPayload) => {
            setState((current) =>
                current ? applyProjectionGameCreated(current, payload) : current,
            );
            setRemainingSeconds(0);
        });

        socket.on('room:archived', (payload: { roomId: string }) => {
            setState((current) =>
                current ? applyProjectionRoomArchived(current, payload) : current,
            );
            setRemainingSeconds(0);
            socket.disconnect();
        });

        return () => {
            if (socketRef.current === socket) {
                socketRef.current = null;
            }
            socket.removeAllListeners();
            socket.disconnect();
        };
    }, [connectedRoomCode, connectedRoomId, isRoomArchived, loadRoomState, tokenRevision]);

    const activeRound = state?.activeRound ?? null;

    // Cronômetro estritamente visual baseado em expiresAt e no relógio monotônico sincronizado.
    useEffect(() => {
        if (!activeRound) return;

        const updateVisualCountdown = () => {
            setRemainingSeconds(
                computeRemainingSecondsFromDeadline(
                    activeRound.expiresAt,
                    activeRound.openedAt,
                    activeRound.timeLimit,
                ),
            );
        };

        const initTimerId = window.setTimeout(updateVisualCountdown, 0);

        const unsubscribeClock = subscribeServerClock(() => {
            updateVisualCountdown();
        });

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                updateVisualCountdown();
                if (socketRef.current?.connected) {
                    void syncSocketClock(socketRef.current).then(() => {
                        updateVisualCountdown();
                    });
                }
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const intervalId = window.setInterval(updateVisualCountdown, TIMER_TICK_MS);

        return () => {
            window.clearTimeout(initTimerId);
            window.clearInterval(intervalId);
            unsubscribeClock();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [activeRound]);

    const phase = state ? deriveProjectionPhase(state) : null;
    const eligiblePlayerCount = state ? countEligiblePlayers(state.players) : 0;

    return {
        isLoading,
        loadError,
        socketStatus,
        socketError,
        state,
        phase,
        remainingSeconds,
        eligiblePlayerCount,
        retryLoad: () => {
            void loadRoomState();
        },
    };
}
