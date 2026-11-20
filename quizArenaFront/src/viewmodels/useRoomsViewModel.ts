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
    canPlayAgain,
    computeRemainingSecondsFromDeadline,
    executeLoadHostRooms,
    executeLoadRoomByCode,
    executePlayAgain,
    executeSubmitRoom,
    extractHostMatchRecoveryState,
    mapBackendRoomStatus,
    upsertRoomInList,
    type HostSessionTracker,
    type Room,
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
    closeRoundApi,
    createNextRoundApi,
    createRoomApi,
    getGameResultsApi,
    getRoomLobbyApi,
    listHostRoomsApi,
    listRoomGamesApi,
    mapApiRoomToModel,
    playAgainApi,
    startRoomApi,
    updateRoomApi,
    type ApiGameDetailedResults,
    type ApiGameHistoryItem,
    type ApiHostRoom,
    type ApiRoomLobby,
} from '../services/roomStorageService';
import {
    createHostSocket,
    type GameCreatedPayload,
    type GameFinishedPayload,
    type GameMode,
    type GameStartedPayload,
    type PlayerJoinedPayload,
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
    const [isLoadingRoom, setIsLoadingRoom] = useState(false);
    const [isLoadingHostRooms, setIsLoadingHostRooms] = useState(false);
    const [roomActionError, setRoomActionError] = useState<string | null>(null);
    const [hostRoomsError, setHostRoomsError] = useState<string | null>(null);
    const [isStartingMatch, setIsStartingMatch] = useState(false);
    const [isAdvancingRound, setIsAdvancingRound] = useState(false);
    const [isPlayingAgain, setIsPlayingAgain] = useState(false);

    // Estado da partida em tempo real conduzida pelo anfitrião
    const [activeRound, setActiveRound] = useState<RoundStartedPayload['round'] | null>(null);
    const [closedRound, setClosedRound] = useState<RoundClosedPayload['round'] | null>(null);
    const [answeredPlayers, setAnsweredPlayers] = useState<{ id: string; nickname: string }[]>([]);
    const [roundRemainingSeconds, setRoundRemainingSeconds] = useState(0);

    // Formulário de criação/edição de sala
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [name, setName] = useState('');
    const [theme, setTheme] = useState(DEFAULT_THEME);
    const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT);
    const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
    const [gameMode, setGameMode] = useState<GameMode>(DEFAULT_GAME_MODE);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);

    // Busca de sala existente por código
    const [lookupCode, setLookupCode] = useState('');

    // Sala cujo código está sendo exibido em destaque (modal de projeção)
    const [displayedRoom, setDisplayedRoom] = useState<Room | null>(null);

    // Sala aguardando confirmação de remoção da visualização
    const [roomPendingDeletion, setRoomPendingDeletion] = useState<Room | null>(null);

    // Histórico persistido e relatório aberto
    const [roomGames, setRoomGames] = useState<ApiGameHistoryItem[]>([]);
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
    const isSubmittingRoomRef = useRef(false);
    const isPlayingAgainRef = useRef(false);
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

    const resetSessionState = useCallback(() => {
        roomsRef.current = [];
        activeRoundIdRef.current = null;
        gamesRequestSeqRef.current += 1;
        reportRequestSeqRef.current += 1;
        setRooms([]);
        setActiveRoomId(null);
        setRoomGames([]);
        setIsLoadingRoomGames(false);
        setRoomGamesError(null);
        setActiveRound(null);
        setClosedRound(null);
        setAnsweredPlayers([]);
        setRoundRemainingSeconds(0);
        setRoomActionError(null);
        setHostRoomsError(null);
        setDisplayedRoom(null);
        setRoomPendingDeletion(null);
        setReportView(null);
        setLookupCode('');
        clearAllRoomResults();
    }, []);

    const refreshRoomGames = useCallback(
        async (targetRoomId?: string | null) => {
            const roomIdToLoad = targetRoomId !== undefined ? targetRoomId : currentRoomId;
            return executeLoadRoomGames({
                roomId: roomIdToLoad,
                requestSeqRef: gamesRequestSeqRef,
                fetchRoomGames: listRoomGamesApi,
                onLoadingChange: setIsLoadingRoomGames,
                onError: setRoomGamesError,
                onSuccess: setRoomGames,
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
                    setActiveRoomId(lobby.id);
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('sala', lobby.code);
                        return next;
                    }, { replace: true });

                    return mappedRoom!;
                },
            });
        },
        [applyHostRoundRecovery, setSearchParams],
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
                    setRoomGamesError(null);
                }
                return room.id;
            });
            setRoomActionError(null);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
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
        [loadRoomByCode, setSearchParams],
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

    // Conexão Socket.IO do Anfitrião para a sala ativa
    useEffect(() => {
        if (!currentRoomId || !currentRoomCode) return;
        const token = localStorage.getItem('token');
        if (!token) return;

        const socket = createHostSocket(token, currentRoomCode);
        let hasConnectedOnce = false;

        socket.on('connect', () => {
            if (!hasConnectedOnce) {
                hasConnectedOnce = true;
                return;
            }
            // Em reconexões WebSocket, re-sincroniza via API para recuperar eventos perdidos offline.
            void loadRoomByCode(currentRoomCode);
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
            activeRoundIdRef.current = null;
            setActiveRound(null);
            setClosedRound(null);
            setRoundRemainingSeconds(0);
            setRooms((current) =>
                current.map((room) =>
                    room.id === payload.roomId
                        ? {
                              ...room,
                              backendStatus: 'FINISHED',
                              status: 'Finalizado',
                          }
                        : room,
                ),
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

        return () => {
            socket.disconnect();
        };
    }, [currentRoomId, currentRoomCode, loadRoomByCode, refreshRoomGames]);

    // Encerrar rodada atual no servidor
    const closeCurrentRound = useCallback(
        async (roundIdToClose?: string) => {
            const targetRoundId = roundIdToClose ?? activeRound?.id;
            if (!targetRoundId || !currentRoomId) return;
            if (closingRoundIdRef.current === targetRoundId) return;

            closingRoundIdRef.current = targetRoundId;
            setRoomActionError(null);

            try {
                const response = await closeRoundApi(targetRoundId);
                recordRoundClosedResult(currentRoomId, response);
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
            } catch {
                // Caso haja pequena diferença de relógio no servidor, tenta novamente após 500ms
                window.setTimeout(async () => {
                    try {
                        const retryResponse = await closeRoundApi(targetRoundId);
                        recordRoundClosedResult(currentRoomId, retryResponse);
                        setClosedRound(retryResponse.round);
                        setActiveRound(null);
                        setRoundRemainingSeconds(0);
                    } catch (retryErr) {
                        closingRoundIdRef.current = null;
                        setRoomActionError(
                            retryErr instanceof Error
                                ? retryErr.message
                                : 'Não foi possível encerrar a rodada.',
                        );
                    }
                }, 500);
            }
        },
        [activeRound?.id, currentRoomId],
    );

    // Cronômetro estritamente visual baseado no prazo autoritativo `expiresAt` do servidor.
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

        const intervalId = window.setInterval(updateVisualCountdown, 250);

        return () => window.clearInterval(intervalId);
    }, [activeRound]);

    // Ações de condução da partida pelo anfitrião
    const startMatch = useCallback(
        async (roomToStart?: Room) => {
            const targetRoom = roomToStart ?? activeRoom;
            if (!targetRoom) return;

            setIsStartingMatch(true);
            setRoomActionError(null);

            try {
                const freshLobby = await getRoomLobbyApi(targetRoom.code);
                if (freshLobby.players.length < MIN_ROOM_PLAYERS) {
                    throw new Error(
                        `São necessários pelo menos ${MIN_ROOM_PLAYERS} jogadores na sala para iniciar (atual: ${freshLobby.players.length}).`,
                    );
                }

                const startedRoom = await startRoomApi(targetRoom.id);
                setRooms((current) =>
                    current.map((r) =>
                        r.id === targetRoom.id
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
                const nextRoundResponse = await createNextRoundApi(targetRoom.id);
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
            } catch (err) {
                setRoomActionError(
                    err instanceof Error
                        ? err.message
                        : 'Não foi possível iniciar a partida.',
                );
            } finally {
                setIsStartingMatch(false);
            }
        },
        [activeRoom],
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
        [activeRoom, refreshRoomGames, setSearchParams],
    );

    const openCreate = useCallback(() => {
        setEditingRoom(null);
        setName('');
        setTheme(DEFAULT_THEME);
        setTimeLimit(DEFAULT_TIME_LIMIT);
        setMaxPlayers(DEFAULT_MAX_PLAYERS);
        setGameMode(DEFAULT_GAME_MODE);
        setFormError(null);
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
        setIsCreateOpen(true);
    }

    const closeCreate = useCallback(() => {
        if (isSubmittingRoomRef.current) return;
        setFormError(null);
        setIsCreateOpen(false);
    }, []);

    async function submitRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        await executeSubmitRoom({
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
                        current.map((room) =>
                            room.id === editingRoom.id
                                ? {
                                      ...room,
                                      name: validInput.name.trim(),
                                      theme: validInput.theme.trim() || DEFAULT_THEME,
                                      timeLimit: apiRoom.questionTime,
                                      maxPlayers: apiRoom.maxPlayers,
                                      gameMode: apiRoom.gameMode,
                                  }
                                : room,
                        ),
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
                setRooms((current) => upsertRoomInList(current, newRoom));
                setActiveRoomId(newRoom.id);
                setActiveRound(null);
                setClosedRound(null);
                setAnsweredPlayers([]);
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('sala', newRoom.code);
                    return next;
                }, { replace: true });
                setIsCreateOpen(false);
            },
        });
    }

    async function handleLookupRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!lookupCode.trim()) return;
        const loaded = await loadRoomByCode(lookupCode);
        if (loaded) {
            setLookupCode('');
        }
    }

    const requestDelete = useCallback((room: Room) => setRoomPendingDeletion(room), []);
    const cancelDelete = useCallback(() => setRoomPendingDeletion(null), []);

    function confirmDelete() {
        if (!roomPendingDeletion) return;
        const deletedId = roomPendingDeletion.id;
        setRooms((current) => current.filter((room) => room.id !== deletedId));
        setDisplayedRoom((current) => (current?.id === deletedId ? null : current));
        if (activeRoomId === deletedId) {
            setActiveRoomId(null);
        }
        deleteRoomResults(deletedId);
        setRoomPendingDeletion(null);
    }

    const openGameReport = useCallback(async (room: Room, gameId: string) => {
        await executeOpenGameResults({
            room,
            gameId,
            requestSeqRef: reportRequestSeqRef,
            fetchGameResults: getGameResultsApi,
            onStateChange: setReportView,
        });
    }, []);

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
        hostRoomsError,
        clearRoomActionError: () => setRoomActionError(null),
        reloadHostRooms,
        resetSessionState,
        refreshActiveRoomLobby: () =>
            activeRoom
                ? loadRoomByCode(activeRoom.code, { name: activeRoom.name, theme: activeRoom.theme })
                : Promise.resolve(null),
        lookupCode,
        setLookupCode: (val: string) => setLookupCode(normalizeRoomCodeInput(val)),
        handleLookupRoom,
        activeRound,
        closedRound,
        answeredPlayers,
        roundRemainingSeconds,
        isStartingMatch,
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
        setName: (value: string) => {
            setName(value);
            setFormError(null);
        },
        setTheme: (value: string) => {
            setTheme(value);
            setFormError(null);
        },
        setTimeLimit: (value: number) => {
            setTimeLimit(value);
            setFormError(null);
        },
        setMaxPlayers: (value: number) => {
            setMaxPlayers(value);
            setFormError(null);
        },
        setGameMode: (value: GameMode) => {
            setGameMode(value);
            setFormError(null);
        },
        openCreate,
        openEdit,
        closeCreate,
        isEditing: editingRoom !== null,
        editingRoom,
        submitRoom,
        roomPendingDeletion,
        requestDelete,
        cancelDelete,
        confirmDelete,
        roomGames,
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
