import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    normalizeRoomCode,
    normalizeRoomCodeInput,
} from '../models/game';
import type { Question } from '../models/question';
import {
    MIN_ROOM_PLAYERS,
    MIN_ROOM_QUESTIONS,
    applyGameCreatedToRooms,
    applyPlayerLeftToRooms,
    canPlayAgain,
    computeRemainingSecondsFromDeadline,
    executeArchiveRoom,
    executeCloseRound,
    executeFinishMatch,
    executeLoadHostRooms,
    executeLoadRoomByCode,
    executePlayAgain,
    executeStartMatch,
    executeSubmitRoom,
    extractHostMatchRecoveryState,
    mapBackendRoomStatus,
    upsertRoomInList,
    type HostSessionTracker,
    type Room,
    type RoomFormField,
    type RoomFormFieldErrors,
    type StartMatchErrorKind,
} from '../models/room';
import {
    buildRoomReport,
    executeLoadRoomGames,
    executeOpenGameResults,
    type RoomReport,
} from '../models/roomReport';
import {
    clearAllRoomResults,
    deleteRoomResults,
    loadRoomResults,
    recordRoundClosedResult,
} from '../services/roomResultsService';
import {
    archiveRoomApi,
    closeRoundApi,
    createNextRoundApi,
    createRoomApi,
    finishRoomApi,
    getGameResultsApi,
    getRoomLobbyApi,
    listHostRoomsApi,
    listRoomGamesWithStatsApi,
    mapApiRoomToModel,
    playAgainApi,
    startRoomApi,
    updateRoomApi,
    type ApiGameDetailedResults,
    type ApiGameHistoryItem,
    type ApiHostRoom,
    type ApiRoomAggregatedStats,
    type ApiRoomLobby,
} from '../services/roomStorageService';
import { subscribeServerClock } from '../services/serverClock';
import {
    AUTH_TOKEN_UPDATED_EVENT,
    createHostSocket,
    isSocketAuthRejectionError,
    syncSocketClock,
    type GameCreatedPayload,
    type GameFinishedPayload,
    type GameMode,
    type GameStartedPayload,
    type PlayerJoinedPayload,
    type PlayerLeftPayload,
    type RoomUpdatedPayload,
    type RoundAnswerSubmittedPayload,
    type RoundClosedPayload,
    type RoundStartedPayload,
} from '../services/socket';

const DEFAULT_THEME = 'Tecnologia';
const DEFAULT_TIME_LIMIT = 30;
const DEFAULT_MAX_PLAYERS = 10;
const DEFAULT_GAME_MODE: GameMode = 'CLASSIC';

export function useRoomsViewModel(authenticatedUserId?: string | null) {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlRoomCode = normalizeRoomCode(searchParams.get('sala') ?? '') || null;

    const [rooms, setRooms] = useState<Room[]>([]);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [hostAuthTokenRevision, setHostAuthTokenRevision] = useState(0);
    const [isLoadingRoom, setIsLoadingRoom] = useState(false);
    const [isLoadingHostRooms, setIsLoadingHostRooms] = useState(false);
    const [roomActionError, setRoomActionError] = useState<string | null>(null);
    const [startMatchError, setStartMatchError] = useState<string | null>(null);
    const [startMatchErrorKind, setStartMatchErrorKind] =
        useState<StartMatchErrorKind | null>(null);
    const [hasAttemptedStart, setHasAttemptedStart] = useState(false);
    const [hostRoomsError, setHostRoomsError] = useState<string | null>(null);
    const [isStartingMatch, setIsStartingMatch] = useState(false);
    const [isClosingRound, setIsClosingRound] = useState(false);
    const [isAdvancingRound, setIsAdvancingRound] = useState(false);
    const [isPlayingAgain, setIsPlayingAgain] = useState(false);

    // Estado da partida em tempo real conduzida pelo anfitrião
    const [activeRound, setActiveRound] = useState<RoundStartedPayload['round'] | null>(null);
    const [closedRound, setClosedRound] = useState<RoundClosedPayload['round'] | null>(null);
    const [answeredPlayers, setAnsweredPlayers] = useState<
        { id: string; nickname: string; avatarId?: string }[]
    >([]);
    const [roundRemainingSeconds, setRoundRemainingSeconds] = useState<number | null>(0);

    // Formulário de criação/edição de sala
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [name, setName] = useState('');
    const [theme, setTheme] = useState(DEFAULT_THEME);
    const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT);
    const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
    const [gameMode, setGameMode] = useState<GameMode>(DEFAULT_GAME_MODE);
    const [formError, setFormError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<RoomFormFieldErrors>({});
    const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);

    // Busca de sala existente por código
    const [lookupCode, setLookupCode] = useState('');

    // Sala cujo código está sendo exibido em destaque (modal de projeção)
    const [displayedRoom, setDisplayedRoom] = useState<Room | null>(null);

    // Sala aguardando confirmação de arquivamento/remoção
    const [roomPendingDeletion, setRoomPendingDeletion] = useState<Room | null>(null);
    const [isArchivingRoom, setIsArchivingRoom] = useState(false);
    const [archiveRoomError, setArchiveRoomError] = useState<string | null>(null);

    // Sala aguardando confirmação de encerramento antecipado da partida
    const [roomPendingFinish, setRoomPendingFinish] = useState<Room | null>(null);
    const [isFinishingMatch, setIsFinishingMatch] = useState(false);
    const [finishMatchError, setFinishMatchError] = useState<string | null>(null);

    // Histórico persistido, estatísticas consolidadas da sala e relatório aberto
    const [roomGames, setRoomGames] = useState<ApiGameHistoryItem[]>([]);
    const [roomStats, setRoomStats] = useState<ApiRoomAggregatedStats | null>(null);
    const [isLoadingRoomGames, setIsLoadingRoomGames] = useState(false);
    const [roomGamesError, setRoomGamesError] = useState<string | null>(null);
    const [reportView, setReportView] = useState<{
        room: Room;
        report: RoomReport | null;
        gameDetails?: ApiGameDetailedResults | null;
        isLoading?: boolean;
        error?: string | null;
    } | null>(null);

    const closingRoundIdRef = useRef<string | null>(null);
    const activeRoundIdRef = useRef<string | null>(null);
    const hostSocketRef = useRef<ReturnType<typeof createHostSocket> | null>(null);
    const isSubmittingRoomRef = useRef(false);
    const isStartingMatchRef = useRef(false);
    const isPlayingAgainRef = useRef(false);
    const isArchivingRoomRef = useRef(false);
    const isFinishingMatchRef = useRef(false);
    const gamesRequestSeqRef = useRef(0);
    const reportRequestSeqRef = useRef(0);
    const sessionTrackerRef = useRef<HostSessionTracker>({
        activeSessionKey: null,
        requestSeq: 0,
    });
    const roomsRef = useRef<Room[]>([]);
    const urlRoomCodeRef = useRef<string | null>(urlRoomCode);

    useEffect(() => {
        roomsRef.current = rooms;
        urlRoomCodeRef.current = urlRoomCode;
    }, [rooms, urlRoomCode]);

    useEffect(() => {
        activeRoundIdRef.current = activeRound?.id ?? null;
    }, [activeRound]);

    const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
    const currentRoomId = activeRoom?.id ?? null;
    const currentRoomCode = activeRoom?.code ?? null;

    const applyHostRoundRecovery = useCallback(
        (apiRoom: ApiHostRoom | ApiRoomLobby) => {
            const recovered = extractHostMatchRecoveryState(apiRoom.currentGame);
            const preservedSameOpenRound =
                recovered.activeRound !== null &&
                activeRoundIdRef.current === recovered.activeRound.id;

            activeRoundIdRef.current = recovered.activeRound?.id ?? null;
            setActiveRound(recovered.activeRound);
            setClosedRound(recovered.closedRound);
            if (!preservedSameOpenRound || recovered.answeredPlayers.length > 0) {
                setAnsweredPlayers(recovered.answeredPlayers);
            }
            setRoundRemainingSeconds(recovered.remainingSeconds);

            if (recovered.closedRound) {
                recordRoundClosedResult(apiRoom.id, { round: recovered.closedRound });
            }
        },
        [],
    );

    const clearStartMatchFeedback = useCallback(() => {
        setHasAttemptedStart(false);
        setStartMatchError(null);
        setStartMatchErrorKind(null);
    }, []);

    const resetSessionState = useCallback(() => {
        roomsRef.current = [];
        closingRoundIdRef.current = null;
        activeRoundIdRef.current = null;
        setIsClosingRound(false);
        gamesRequestSeqRef.current += 1;
        reportRequestSeqRef.current += 1;
        setRooms([]);
        setActiveRoomId(null);
        setRoomGames([]);
        setRoomStats(null);
        setIsLoadingRoomGames(false);
        setRoomGamesError(null);
        setActiveRound(null);
        setClosedRound(null);
        setAnsweredPlayers([]);
        setRoundRemainingSeconds(0);
        setRoomActionError(null);
        clearStartMatchFeedback();
        setHostRoomsError(null);
        setDisplayedRoom(null);
        setRoomPendingDeletion(null);
        setIsArchivingRoom(false);
        setArchiveRoomError(null);
        setRoomPendingFinish(null);
        setIsFinishingMatch(false);
        setFinishMatchError(null);
        setReportView(null);
        setLookupCode('');
        clearAllRoomResults();
    }, [clearStartMatchFeedback]);

    const refreshRoomGames = useCallback(
        async (targetRoomId?: string | null) => {
            const roomIdToLoad = targetRoomId !== undefined ? targetRoomId : currentRoomId;
            return executeLoadRoomGames({
                roomId: roomIdToLoad,
                requestSeqRef: gamesRequestSeqRef,
                fetchRoomGamesWithStats: listRoomGamesWithStatsApi,
                onLoadingChange: setIsLoadingRoomGames,
                onError: setRoomGamesError,
                onSuccess: setRoomGames,
                onStatsSuccess: (nextStats) => {
                    setRoomStats(nextStats);
                    if (nextStats) {
                        setRooms((current) =>
                            current.map((room) =>
                                room.id === nextStats.roomId
                                    ? {
                                          ...room,
                                          finishedGamesCount: nextStats.finishedGamesCount,
                                          lastGameFinishedAt: nextStats.lastFinishedGameAt,
                                      }
                                    : room,
                            ),
                        );
                    }
                },
            });
        },
        [currentRoomId],
    );

    useEffect(() => {
        let active = true;

        async function loadSelectedRoomGames() {
            await Promise.resolve();
            if (!active) return;

            setRoomGames([]);
            setRoomStats(null);
            setRoomGamesError(null);

            if (!currentRoomId) {
                gamesRequestSeqRef.current += 1;
                setIsLoadingRoomGames(false);
                return;
            }

            await refreshRoomGames(currentRoomId);
        }

        void loadSelectedRoomGames();

        return () => {
            active = false;
        };
    }, [currentRoomId, refreshRoomGames]);

    const loadRoomByCode = useCallback(
        async (code: string, meta?: { name?: string; theme?: string }) => {
            return executeLoadRoomByCode({
                code,
                fetchLobby: (cleanCode) => getRoomLobbyApi(cleanCode),
                onLoadingChange: setIsLoadingRoom,
                onError: setRoomActionError,
                onSuccess: (lobby) => {
                    let mappedRoom: Room | null = null;

                    setRooms((current) => {
                        const existing = current.find((r) => r.id === lobby.id);
                        mappedRoom = mapApiRoomToModel(lobby, {
                            name: meta?.name ?? existing?.name,
                            theme: meta?.theme ?? existing?.theme,
                            questionIds: existing?.questionIds ?? [],
                        });
                        return upsertRoomInList(current, mappedRoom);
                    });

                    applyHostRoundRecovery(lobby);
                    if (lobby.id !== currentRoomId || lobby.status !== 'WAITING') {
                        clearStartMatchFeedback();
                    }
                    setActiveRoomId(lobby.id);
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('aba');
                        next.set('sala', lobby.code);
                        return next;
                    }, { replace: true });

                    return mappedRoom!;
                },
            });
        },
        [applyHostRoundRecovery, clearStartMatchFeedback, currentRoomId, setSearchParams],
    );

    const selectRoom = useCallback(
        (room: Room) => {
            setActiveRoomId((currentId) => {
                if (currentId !== room.id) {
                    activeRoundIdRef.current = null;
                    setActiveRound(null);
                    setClosedRound(null);
                    setAnsweredPlayers([]);
                    setRoundRemainingSeconds(0);
                    setRoomGames([]);
                    setRoomStats(null);
                    setRoomGamesError(null);
                }
                return room.id;
            });
            setRoomActionError(null);
            if (currentRoomId !== room.id) {
                clearStartMatchFeedback();
            }
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('aba');
                next.set('sala', room.code);
                return next;
            }, { replace: true });

            if (room.backendStatus === 'IN_PROGRESS') {
                void loadRoomByCode(room.code, {
                    name: room.name,
                    theme: room.theme,
                });
            }
        },
        [clearStartMatchFeedback, currentRoomId, loadRoomByCode, setSearchParams],
    );

    const reloadHostRooms = useCallback(async () => {
        const token =
            typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const sessionKey = authenticatedUserId ?? token;
        const loadedApiRoomsById = new Map<string, ApiHostRoom>();

        return executeLoadHostRooms({
            sessionKey,
            expectedHostId: authenticatedUserId ?? null,
            requestedUrlCode: urlRoomCodeRef.current,
            trackerRef: sessionTrackerRef,
            existingRooms: roomsRef.current,
            fetchHostRooms: () => listHostRoomsApi(),
            mapRoom: (apiRoom, existing) => {
                loadedApiRoomsById.set(apiRoom.id, apiRoom);
                return mapApiRoomToModel(apiRoom, {
                    name: existing?.name,
                    theme: existing?.theme,
                    questionIds: existing?.questionIds,
                });
            },
            onResetSessionState: resetSessionState,
            onLoadingChange: setIsLoadingHostRooms,
            onError: setHostRoomsError,
            onSuccess: ({ rooms: loadedRooms, selectedRoomId, shouldClearUrlParam }) => {
                setRooms(loadedRooms);
                setActiveRoomId(selectedRoomId);

                if (selectedRoomId) {
                    const selectedApiRoom = loadedApiRoomsById.get(selectedRoomId);
                    if (selectedApiRoom) {
                        applyHostRoundRecovery(selectedApiRoom);
                    }
                }

                if (shouldClearUrlParam) {
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('sala');
                        return next;
                    }, { replace: true });
                }
            },
        });
    }, [applyHostRoundRecovery, authenticatedUserId, resetSessionState, setSearchParams]);

    // Carrega automaticamente todas as salas do host autenticado ao abrir o Dashboard ou trocar de sessão
    useEffect(() => {
        void reloadHostRooms();
    }, [reloadHostRooms]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleTokenUpdated = () => {
            setHostAuthTokenRevision((revision) => revision + 1);
        };
        window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, handleTokenUpdated);
        return () => {
            window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, handleTokenUpdated);
        };
    }, []);

    // Conexão Socket.IO do Anfitrião para a sala ativa
    useEffect(() => {
        if (!currentRoomId || !currentRoomCode) return;
        const token = localStorage.getItem('token');
        if (!token) return;

        const socket = createHostSocket(token, currentRoomCode);
        hostSocketRef.current = socket;
        let hasConnectedOnce = false;

        socket.on('connect', () => {
            void syncSocketClock(socket);
            if (!hasConnectedOnce) {
                hasConnectedOnce = true;
                return;
            }
            // Em reconexões WebSocket, re-sincroniza via API para recuperar eventos perdidos offline.
            void loadRoomByCode(currentRoomCode);
        });

        socket.on('connect_error', (err) => {
            if (isSocketAuthRejectionError(err)) {
                socket.disconnect();
            }
        });

        socket.on('player:joined', (payload: PlayerJoinedPayload) => {
            if (payload.roomId !== currentRoomId) return;
            setRooms((current) =>
                current.map((room) => {
                    if (room.id !== payload.roomId) return room;
                    const exists = room.players.some((p) => p.id === payload.player.id);
                    const updatedPlayers = exists
                        ? room.players.map((p) => (p.id === payload.player.id ? payload.player : p))
                        : [...room.players, payload.player];
                    return { ...room, players: updatedPlayers };
                }),
            );
        });

        socket.on('player:left', (payload: PlayerLeftPayload) => {
            if (payload.roomId !== currentRoomId) return;
            setRooms((current) => applyPlayerLeftToRooms(current, payload));
            setAnsweredPlayers((current) =>
                current.filter((player) => player.id !== payload.player.id),
            );
        });

        socket.on('room:updated', (payload: RoomUpdatedPayload) => {
            if (payload.roomId !== currentRoomId) return;
            setRooms((current) =>
                current.map((room) =>
                    room.id === payload.roomId
                        ? {
                              ...room,
                              maxPlayers: payload.maxPlayers,
                              timeLimit: payload.questionTime,
                              gameMode: payload.gameMode,
                          }
                        : room,
                ),
            );
        });

        socket.on('game:started', (payload: GameStartedPayload) => {
            if (payload.roomId !== currentRoomId) return;
            setRooms((current) =>
                current.map((room) =>
                    room.id === payload.roomId
                        ? {
                              ...room,
                              backendStatus: payload.status,
                              status: mapBackendRoomStatus(payload.status),
                          }
                        : room,
                ),
            );
        });

        socket.on('round:started', (payload: RoundStartedPayload) => {
            closingRoundIdRef.current = null;
            const isSameRound = activeRoundIdRef.current === payload.round.id;
            activeRoundIdRef.current = payload.round.id;
            setActiveRound(payload.round);
            setClosedRound(null);
            if (!isSameRound) {
                setAnsweredPlayers([]);
            }
            setRoundRemainingSeconds(
                computeRemainingSecondsFromDeadline(
                    payload.round.expiresAt,
                    payload.round.openedAt,
                    payload.round.timeLimit,
                ),
            );
        });

        socket.on('round:answer-submitted', (payload: RoundAnswerSubmittedPayload) => {
            if (activeRoundIdRef.current && payload.roundId !== activeRoundIdRef.current) {
                return;
            }
            setAnsweredPlayers((current) => {
                if (current.some((p) => p.id === payload.player.id)) return current;
                return [...current, payload.player];
            });
        });

        socket.on('round:closed', (payload: RoundClosedPayload) => {
            recordRoundClosedResult(currentRoomId, payload);
            activeRoundIdRef.current = null;
            setClosedRound(payload.round);
            setActiveRound(null);
            setRoundRemainingSeconds(0);
            setRooms((current) =>
                current.map((room) => {
                    if (room.id !== currentRoomId) return room;
                    const updatedPlayers = room.players.map((p) => {
                        const ranked = payload.round.ranking.find((r) => r.id === p.id);
                        return ranked ? { ...p, score: ranked.score } : p;
                    });
                    return { ...room, players: updatedPlayers };
                }),
            );
        });

        socket.on('game:finished', (payload: GameFinishedPayload) => {
            if (payload.roomId !== currentRoomId) return;
            closingRoundIdRef.current = null;
            activeRoundIdRef.current = null;
            setActiveRound(null);
            setClosedRound(null);
            setAnsweredPlayers([]);
            setRoundRemainingSeconds(0);
            setRooms((current) =>
                current.map((room) => {
                    if (room.id !== payload.roomId) return room;
                    const updatedPlayers = Array.isArray(payload.ranking)
                        ? room.players.map((p) => {
                              const ranked = payload.ranking?.find((r) => r.id === p.id);
                              return ranked ? { ...p, score: ranked.score } : p;
                          })
                        : room.players;
                    const nextBackendStatus =
                        payload.status === 'CANCELLED' ? 'CANCELLED' : 'FINISHED';

                    return {
                        ...room,
                        players: updatedPlayers,
                        backendStatus: nextBackendStatus,
                        status: 'Finalizado',
                    };
                }),
            );
            void refreshRoomGames(payload.roomId);
        });

        socket.on('game:created', (payload: GameCreatedPayload) => {
            if (payload.roomId !== currentRoomId) return;
            let didReset = false;
            setRooms((current) => {
                const applied = applyGameCreatedToRooms(current, payload);
                didReset = applied.didResetLiveGame;
                return applied.rooms;
            });
            if (didReset) {
                closingRoundIdRef.current = null;
                activeRoundIdRef.current = null;
                setActiveRound(null);
                setClosedRound(null);
                setAnsweredPlayers([]);
                setRoundRemainingSeconds(0);
                deleteRoomResults(payload.roomId);
                void refreshRoomGames(payload.roomId);
            }
        });

        socket.on('room:archived', (payload: { roomId: string }) => {
            if (payload.roomId !== currentRoomId) return;
            setRooms((current) => current.filter((room) => room.id !== payload.roomId));
            setDisplayedRoom((current) => (current?.id === payload.roomId ? null : current));
            setReportView((current) => (current?.room.id === payload.roomId ? null : current));
            setActiveRoomId(null);
            closingRoundIdRef.current = null;
            activeRoundIdRef.current = null;
            setActiveRound(null);
            setClosedRound(null);
            setAnsweredPlayers([]);
            setRoundRemainingSeconds(0);
            setRoomGames([]);
            setRoomStats(null);
            setRoomGamesError(null);
            deleteRoomResults(payload.roomId);
        });

        return () => {
            if (hostSocketRef.current === socket) {
                hostSocketRef.current = null;
            }
            socket.removeAllListeners();
            socket.disconnect();
        };
    }, [currentRoomId, currentRoomCode, hostAuthTokenRevision, loadRoomByCode, refreshRoomGames]);

    // Encerrar rodada atual manualmente no servidor
    const closeCurrentRound = useCallback(
        async (roundIdToClose?: string) => {
            const targetRoundId = roundIdToClose ?? activeRound?.id;
            if (!targetRoundId || !currentRoomId) return;

            await executeCloseRound({
                roundId: targetRoundId,
                closingRoundIdRef,
                requestClose: closeRoundApi,
                onClosingChange: setIsClosingRound,
                onError: setRoomActionError,
                onSuccess: (response) => {
                    recordRoundClosedResult(currentRoomId, response);
                    activeRoundIdRef.current = null;
                    setClosedRound(response.round);
                    setActiveRound(null);
                    setRoundRemainingSeconds(0);
                    setRooms((current) =>
                        current.map((room) => {
                            if (room.id !== currentRoomId) return room;
                            const updatedPlayers = room.players.map((p) => {
                                const ranked = response.round.ranking.find((r) => r.id === p.id);
                                return ranked ? { ...p, score: ranked.score } : p;
                            });
                            return { ...room, players: updatedPlayers };
                        }),
                    );
                },
            });
        },
        [activeRound?.id, currentRoomId],
    );

    // Cronômetro estritamente visual baseado no prazo autoritativo `expiresAt` do servidor
    // com referência temporal sincronizada e contagem monotônica via `performance.now()`.
    // O encerramento real da rodada é executado exclusivamente pelo backend.
    useEffect(() => {
        if (!activeRound) return;

        const updateVisualCountdown = () => {
            setRoundRemainingSeconds(
                computeRemainingSecondsFromDeadline(
                    activeRound.expiresAt,
                    activeRound.openedAt,
                    activeRound.timeLimit,
                ),
            );
        };

        updateVisualCountdown();

        const unsubscribeClock = subscribeServerClock(() => {
            updateVisualCountdown();
        });

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                updateVisualCountdown();
                if (hostSocketRef.current?.connected) {
                    void syncSocketClock(hostSocketRef.current).then(() => {
                        updateVisualCountdown();
                    });
                }
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const intervalId = window.setInterval(updateVisualCountdown, 250);

        return () => {
            window.clearInterval(intervalId);
            unsubscribeClock();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [activeRound]);

    // Ações de condução da partida pelo anfitrião
    const startMatch = useCallback(
        async (roomToStart?: Room) => {
            const targetRoom = roomToStart ?? activeRoom;

            await executeStartMatch({
                room: targetRoom,
                lockRef: isStartingMatchRef,
                requestStart: startRoomApi,
                onAttemptStart: () => setHasAttemptedStart(true),
                onStartingChange: setIsStartingMatch,
                onError: (message, kind = null) => {
                    setStartMatchError(message);
                    setStartMatchErrorKind(kind);
                },
                onStarted: async (startedRoom, originalRoom) => {
                    clearStartMatchFeedback();
                    setRoomActionError(null);
                    const freshLobby = await getRoomLobbyApi(originalRoom.code);

                    setRooms((current) =>
                        current.map((r) =>
                            r.id === originalRoom.id
                                ? {
                                      ...r,
                                      players: freshLobby.players,
                                      backendStatus: startedRoom.status,
                                      status: mapBackendRoomStatus(startedRoom.status),
                                      ...(startedRoom.currentGame?.id
                                          ? { currentGameId: startedRoom.currentGame.id }
                                          : {}),
                                  }
                                : r,
                        ),
                    );

                    // Abre imediatamente a 1ª rodada
                    const nextRoundResponse = await createNextRoundApi(originalRoom.id);
                    if (!nextRoundResponse.finished) {
                        closingRoundIdRef.current = null;
                        activeRoundIdRef.current = nextRoundResponse.round.id;
                        setActiveRound(nextRoundResponse.round);
                        setClosedRound(null);
                        setAnsweredPlayers([]);
                        setRoundRemainingSeconds(
                            computeRemainingSecondsFromDeadline(
                                nextRoundResponse.round.expiresAt,
                                nextRoundResponse.round.openedAt,
                                nextRoundResponse.round.timeLimit,
                            ),
                        );
                    }
                },
            });
        },
        [activeRoom, clearStartMatchFeedback],
    );

    const advanceToNextRound = useCallback(async () => {
        if (!activeRoom) return;
        setIsAdvancingRound(true);
        setRoomActionError(null);

        try {
            const result = await createNextRoundApi(activeRoom.id);
            if (result.finished) {
                setActiveRound(null);
                setRooms((current) =>
                    current.map((r) =>
                        r.id === activeRoom.id
                            ? {
                                  ...r,
                                  backendStatus: 'FINISHED',
                                  status: 'Finalizado',
                              }
                            : r,
                    ),
                );
                return;
            }

            closingRoundIdRef.current = null;
            activeRoundIdRef.current = result.round.id;
            setActiveRound(result.round);
            setClosedRound(null);
            setAnsweredPlayers([]);
            setRoundRemainingSeconds(
                computeRemainingSecondsFromDeadline(
                    result.round.expiresAt,
                    result.round.openedAt,
                    result.round.timeLimit,
                ),
            );
        } catch (err) {
            setRoomActionError(
                err instanceof Error
                    ? err.message
                    : 'Não foi possível avançar para a próxima rodada.',
            );
        } finally {
            setIsAdvancingRound(false);
        }
    }, [activeRoom]);

    const playAgain = useCallback(
        async (roomToReplay?: Room): Promise<boolean> => {
            const targetRoom = roomToReplay ?? activeRoom;
            if (!canPlayAgain(targetRoom)) {
                return false;
            }

            const updated = await executePlayAgain({
                room: targetRoom,
                lockRef: isPlayingAgainRef,
                requestPlayAgain: playAgainApi,
                mapRoom: (apiRoom, existing) =>
                    mapApiRoomToModel(apiRoom, {
                        name: existing.name,
                        theme: existing.theme,
                        questionIds: existing.questionIds,
                    }),
                onLoadingChange: setIsPlayingAgain,
                onError: setRoomActionError,
                onSuccess: (mappedRoom) => {
                    closingRoundIdRef.current = null;
                    setActiveRound(null);
                    setClosedRound(null);
                    setAnsweredPlayers([]);
                    setRoundRemainingSeconds(0);
                    clearStartMatchFeedback();
                    deleteRoomResults(mappedRoom.id);
                    setRooms((current) => upsertRoomInList(current, mappedRoom));
                    setActiveRoomId(mappedRoom.id);
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('sala', mappedRoom.code);
                        return next;
                    }, { replace: true });
                    void refreshRoomGames(mappedRoom.id);
                },
            });

            return updated !== null;
        },
        [activeRoom, clearStartMatchFeedback, refreshRoomGames, setSearchParams],
    );

    const openCreate = useCallback(() => {
        setEditingRoom(null);
        setName('');
        setTheme(DEFAULT_THEME);
        setTimeLimit(DEFAULT_TIME_LIMIT);
        setMaxPlayers(DEFAULT_MAX_PLAYERS);
        setGameMode(DEFAULT_GAME_MODE);
        setFormError(null);
        setFieldErrors({});
        setIsCreateOpen(true);
    }, []);

    function openEdit(room: Room) {
        setEditingRoom(room);
        setName(room.name);
        setTheme(room.theme);
        setTimeLimit(room.timeLimit);
        setMaxPlayers(room.maxPlayers);
        setGameMode(room.gameMode);
        setFormError(null);
        setFieldErrors({});
        setIsCreateOpen(true);
    }

    const closeCreate = useCallback(() => {
        if (isSubmittingRoomRef.current) return;
        setFormError(null);
        setFieldErrors({});
        setIsCreateOpen(false);
    }, []);

    const clearFieldError = useCallback((field: RoomFormField) => {
        setFormError(null);
        setFieldErrors((current) => {
            if (!current[field]) {
                return current;
            }
            const next = { ...current };
            delete next[field];
            return next;
        });
    }, []);

    async function submitRoom(event: FormEvent<HTMLFormElement>): Promise<boolean> {
        event.preventDefault();

        return executeSubmitRoom({
            input: {
                name,
                theme,
                maxPlayers,
                timeLimit,
                gameMode,
            },
            lockRef: isSubmittingRoomRef,
            onSubmittingChange: setIsSubmittingRoom,
            onError: setFormError,
            onFieldErrors: setFieldErrors,
            executeRequest: (validInput) =>
                editingRoom
                    ? updateRoomApi(editingRoom.id, {
                          name: validInput.name.trim(),
                          theme: validInput.theme.trim() || DEFAULT_THEME,
                          maxPlayers: validInput.maxPlayers,
                          questionTime: validInput.timeLimit,
                          gameMode: validInput.gameMode,
                      })
                    : createRoomApi({
                          name: validInput.name.trim(),
                          theme: validInput.theme.trim() || DEFAULT_THEME,
                          maxPlayers: validInput.maxPlayers,
                          questionTime: validInput.timeLimit,
                          gameMode: validInput.gameMode,
                      }),
            onSuccess: (apiRoom, validInput) => {
                if (editingRoom) {
                    setRooms((current) =>
                        current.map((room) => {
                            if (room.id !== editingRoom.id) {
                                return room;
                            }
                            const mappedRoom = mapApiRoomToModel(apiRoom, {
                                name: validInput.name.trim(),
                                theme: validInput.theme.trim() || DEFAULT_THEME,
                                questionIds: room.questionIds,
                            });
                            return {
                                ...room,
                                ...mappedRoom,
                                players:
                                    'players' in apiRoom && Array.isArray(apiRoom.players)
                                        ? mappedRoom.players
                                        : room.players,
                            };
                        }),
                    );
                    setIsCreateOpen(false);
                    return;
                }

                const newRoom = mapApiRoomToModel(apiRoom, {
                    name: validInput.name.trim(),
                    theme: validInput.theme.trim() || DEFAULT_THEME,
                    questionIds: [],
                });

                // A navegação e fechamento do modal só ocorrem após confirmação válida do backend
                clearStartMatchFeedback();
                setRooms((current) => upsertRoomInList(current, newRoom));
                setActiveRoomId(newRoom.id);
                setActiveRound(null);
                setClosedRound(null);
                setAnsweredPlayers([]);
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete('aba');
                    next.set('sala', newRoom.code);
                    return next;
                }, { replace: true });
                setIsCreateOpen(false);
            },
        });
    }

    async function handleLookupRoom(event: FormEvent<HTMLFormElement>): Promise<boolean> {
        event.preventDefault();
        if (!lookupCode.trim()) return false;
        const loaded = await loadRoomByCode(lookupCode);
        if (loaded) {
            setLookupCode('');
            return true;
        }
        return false;
    }

    const requestDelete = useCallback((room: Room) => {
        setArchiveRoomError(null);
        setRoomPendingDeletion(room);
    }, []);

    const cancelDelete = useCallback(() => {
        if (isArchivingRoomRef.current) return;
        setArchiveRoomError(null);
        setRoomPendingDeletion(null);
    }, []);

    const confirmDelete = useCallback(async () => {
        const targetRoom = roomPendingDeletion;
        if (!targetRoom) return;

        await executeArchiveRoom({
            room: targetRoom,
            lockRef: isArchivingRoomRef,
            requestArchive: archiveRoomApi,
            onArchivingChange: setIsArchivingRoom,
            onError: setArchiveRoomError,
            onSuccess: (archivedId) => {
                setRooms((current) => current.filter((room) => room.id !== archivedId));
                setDisplayedRoom((current) => (current?.id === archivedId ? null : current));
                setReportView((current) => (current?.room.id === archivedId ? null : current));
                if (activeRoomId === archivedId) {
                    setActiveRoomId(null);
                    closingRoundIdRef.current = null;
                    activeRoundIdRef.current = null;
                    setActiveRound(null);
                    setClosedRound(null);
                    setAnsweredPlayers([]);
                    setRoundRemainingSeconds(0);
                    setRoomGames([]);
                    setRoomStats(null);
                    setRoomGamesError(null);
                    clearStartMatchFeedback();
                }
                if (urlRoomCodeRef.current === targetRoom.code) {
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('sala');
                        return next;
                    }, { replace: true });
                }
                deleteRoomResults(archivedId);
                setRoomPendingDeletion(null);
            },
        });
    }, [activeRoomId, clearStartMatchFeedback, roomPendingDeletion, setSearchParams]);

    const openGameReport = useCallback(async (room: Room, gameId: string) => {
        await executeOpenGameResults({
            room,
            gameId,
            requestSeqRef: reportRequestSeqRef,
            fetchGameResults: getGameResultsApi,
            onStateChange: setReportView,
        });
    }, []);

    const requestFinishMatch = useCallback(
        (room?: Room) => {
            const targetRoom = room ?? activeRoom;
            if (!targetRoom || targetRoom.backendStatus !== 'IN_PROGRESS') return;
            setFinishMatchError(null);
            setRoomPendingFinish(targetRoom);
        },
        [activeRoom],
    );

    const cancelFinishMatch = useCallback(() => {
        if (isFinishingMatchRef.current) return;
        setFinishMatchError(null);
        setRoomPendingFinish(null);
    }, []);

    const confirmFinishMatch = useCallback(async () => {
        const targetRoom = roomPendingFinish;
        if (!targetRoom) return;

        await executeFinishMatch({
            room: targetRoom,
            lockRef: isFinishingMatchRef,
            requestFinish: finishRoomApi,
            onFinishingChange: setIsFinishingMatch,
            onError: setFinishMatchError,
            onSuccess: (response, originalRoom) => {
                const mappedFinishedRoom = mapApiRoomToModel(response.room, {
                    name: originalRoom.name,
                    theme: originalRoom.theme,
                    questionIds: originalRoom.questionIds,
                });

                closingRoundIdRef.current = null;
                activeRoundIdRef.current = null;
                setActiveRound(null);
                setClosedRound(null);
                setAnsweredPlayers([]);
                setRoundRemainingSeconds(0);
                setRooms((current) => upsertRoomInList(current, mappedFinishedRoom));
                setActiveRoomId(mappedFinishedRoom.id);
                setRoomPendingFinish(null);
                void refreshRoomGames(mappedFinishedRoom.id);

                const finishedGameId =
                    response.room.currentGame?.id ?? mappedFinishedRoom.currentGameId;
                if (finishedGameId) {
                    void openGameReport(mappedFinishedRoom, finishedGameId);
                }
            },
        });
    }, [openGameReport, refreshRoomGames, roomPendingFinish]);

    function openReport(room: Room, questions: Question[] = []) {
        if (room.currentGameId) {
            void openGameReport(room, room.currentGameId);
            return;
        }
        setReportView({ room, report: buildRoomReport(loadRoomResults(room.id), questions) });
    }

    const closeReport = useCallback(() => {
        reportRequestSeqRef.current += 1;
        setReportView(null);
    }, []);
    const showCode = useCallback((room: Room) => setDisplayedRoom(room), []);
    const hideCode = useCallback(() => setDisplayedRoom(null), []);

    return {
        rooms,
        activeRoom,
        selectRoom,
        isLoadingRoom,
        isLoadingHostRooms,
        roomActionError,
        startMatchError,
        startMatchErrorKind,
        hasAttemptedStart,
        clearStartMatchFeedback,
        hostRoomsError,
        clearRoomActionError: () => setRoomActionError(null),
        reloadHostRooms,
        resetSessionState,
        lookupCode,
        setLookupCode: (val: string) => setLookupCode(normalizeRoomCodeInput(val)),
        handleLookupRoom,
        activeRound,
        closedRound,
        answeredPlayers,
        roundRemainingSeconds,
        isStartingMatch,
        isClosingRound,
        isAdvancingRound,
        isPlayingAgain,
        minPlayers: MIN_ROOM_PLAYERS,
        minQuestions: MIN_ROOM_QUESTIONS,
        startMatch,
        playAgain,
        closeCurrentRound: () => closeCurrentRound(),
        advanceToNextRound,
        isCreateOpen,
        isSubmittingRoom,
        form: { name, theme, timeLimit, maxPlayers, gameMode },
        formError,
        fieldErrors,
        setName: (value: string) => {
            setName(value);
            clearFieldError('name');
        },
        setTheme: (value: string) => {
            setTheme(value);
            clearFieldError('theme');
        },
        setTimeLimit: (value: number) => {
            setTimeLimit(value);
            clearFieldError('timeLimit');
        },
        setMaxPlayers: (value: number) => {
            setMaxPlayers(value);
            clearFieldError('maxPlayers');
        },
        setGameMode: (value: GameMode) => {
            setGameMode(value);
            clearFieldError('gameMode');
        },
        openCreate,
        openEdit,
        closeCreate,
        isEditing: editingRoom !== null,
        editingRoom,
        submitRoom,
        roomPendingDeletion,
        isArchivingRoom,
        archiveRoomError,
        requestDelete,
        cancelDelete,
        confirmDelete,
        roomPendingFinish,
        isFinishingMatch,
        finishMatchError,
        requestFinishMatch,
        cancelFinishMatch,
        confirmFinishMatch,
        roomGames,
        roomStats,
        isLoadingRoomGames,
        roomGamesError,
        refreshRoomGames: () => refreshRoomGames(),
        reportView,
        openGameReport,
        openReport,
        closeReport,
        displayedRoom,
        showCode,
        hideCode,
    };
}
