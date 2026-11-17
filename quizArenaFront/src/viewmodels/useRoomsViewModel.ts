import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Question } from '../models/question';
import {
    MIN_ROOM_PLAYERS,
    MIN_ROOM_QUESTIONS,
    mapBackendRoomStatus,
    type Room,
} from '../models/room';
import { buildRoomReport, type RoomReport } from '../models/roomReport';
import {
    deleteRoomResults,
    loadRoomResults,
    recordRoundClosedResult,
} from '../services/roomResultsService';
import {
    closeRoundApi,
    createNextRoundApi,
    createRoomApi,
    getRoomLobbyApi,
    mapApiRoomToModel,
    startRoomApi,
    updateRoomApi,
} from '../services/roomStorageService';
import {
    createHostSocket,
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

export function useRoomsViewModel() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialCodeFromUrl = searchParams.get('sala')?.trim().toUpperCase() || null;

    const [rooms, setRooms] = useState<Room[]>([]);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [isLoadingRoom, setIsLoadingRoom] = useState(false);
    const [roomActionError, setRoomActionError] = useState<string | null>(null);
    const [isStartingMatch, setIsStartingMatch] = useState(false);
    const [isAdvancingRound, setIsAdvancingRound] = useState(false);

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

    // Relatório aberto
    const [reportView, setReportView] = useState<{ room: Room; report: RoomReport | null } | null>(null);

    const closingRoundIdRef = useRef<string | null>(null);
    const hasLoadedInitialUrlRef = useRef(false);

    const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? rooms[0] ?? null;
    const currentRoomId = activeRoom?.id ?? null;
    const currentRoomCode = activeRoom?.code ?? null;
    const currentRoomPlayerCount = activeRoom?.players.length ?? 0;

    const selectRoom = useCallback(
        (room: Room) => {
            setActiveRoomId(room.id);
            setRoomActionError(null);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('sala', room.code);
                return next;
            }, { replace: true });
        },
        [setSearchParams],
    );

    const loadRoomByCode = useCallback(
        async (code: string, meta?: { name?: string; theme?: string }) => {
            const cleanCode = code.trim().toUpperCase();
            if (!cleanCode) return null;

            setIsLoadingRoom(true);
            setRoomActionError(null);
            try {
                const lobby = await getRoomLobbyApi(cleanCode);
                let mappedRoom: Room | null = null;

                setRooms((current) => {
                    const existing = current.find((r) => r.id === lobby.id);
                    mappedRoom = mapApiRoomToModel(lobby, {
                        name: meta?.name ?? existing?.name,
                        theme: meta?.theme ?? existing?.theme,
                        questionIds: existing?.questionIds ?? [],
                    });
                    const exists = current.some((r) => r.id === lobby.id);
                    return exists
                        ? current.map((r) => (r.id === lobby.id ? mappedRoom! : r))
                        : [mappedRoom, ...current];
                });

                setActiveRoomId(lobby.id);
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('sala', lobby.code);
                    return next;
                }, { replace: true });

                return mappedRoom;
            } catch (err) {
                setRoomActionError(
                    err instanceof Error
                        ? err.message
                        : 'Não foi possível carregar a sala informada.',
                );
                return null;
            } finally {
                setIsLoadingRoom(false);
            }
        },
        [setSearchParams],
    );

    // Carrega automaticamente a sala se o código estiver na URL (?sala=XXXXXX)
    useEffect(() => {
        if (!initialCodeFromUrl || hasLoadedInitialUrlRef.current) return;
        hasLoadedInitialUrlRef.current = true;

        let active = true;
        getRoomLobbyApi(initialCodeFromUrl)
            .then((lobby) => {
                if (!active) return;
                const mapped = mapApiRoomToModel(lobby);
                setRooms((current) => {
                    const exists = current.some((r) => r.id === lobby.id);
                    return exists
                        ? current.map((r) => (r.id === lobby.id ? mapped : r))
                        : [mapped, ...current];
                });
                setActiveRoomId(lobby.id);
            })
            .catch(() => {
                // Código da URL expirado ou não pertence ao host atual
            });

        return () => {
            active = false;
        };
    }, [initialCodeFromUrl]);

    // Conexão Socket.IO do Anfitrião para a sala ativa
    useEffect(() => {
        if (!currentRoomId || !currentRoomCode) return;
        const token = localStorage.getItem('token');
        if (!token) return;

        const socket = createHostSocket(token, currentRoomCode);

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
            setActiveRound(payload.round);
            setClosedRound(null);
            setAnsweredPlayers([]);
            const openedAtMs = new Date(payload.round.openedAt).getTime();
            const deadlineMs = openedAtMs + payload.round.timeLimit * 1000;
            const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
            setRoundRemainingSeconds(remaining);
        });

        socket.on('round:answer-submitted', (payload: RoundAnswerSubmittedPayload) => {
            setAnsweredPlayers((current) => {
                if (current.some((p) => p.id === payload.player.id)) return current;
                return [...current, payload.player];
            });
        });

        socket.on('round:closed', (payload: RoundClosedPayload) => {
            recordRoundClosedResult(currentRoomId, payload);
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
            setActiveRound(null);
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
        });

        return () => {
            socket.disconnect();
        };
    }, [currentRoomId, currentRoomCode]);

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

    // Cronômetro da rodada aberta e fechamento automático (quando todos respondem ou tempo expira)
    useEffect(() => {
        if (!activeRound) return;

        const openedAtMs = new Date(activeRound.openedAt).getTime();
        const deadlineMs = openedAtMs + activeRound.timeLimit * 1000;
        const allAnswered =
            currentRoomPlayerCount > 0 && answeredPlayers.length >= currentRoomPlayerCount;

        const intervalId = window.setInterval(() => {
            if (allAnswered) {
                window.clearInterval(intervalId);
                void closeCurrentRound(activeRound.id);
                return;
            }

            const remainingMs = deadlineMs - Date.now();
            if (remainingMs <= 0) {
                setRoundRemainingSeconds(0);
                if (remainingMs <= -450) {
                    window.clearInterval(intervalId);
                    void closeCurrentRound(activeRound.id);
                }
            } else {
                setRoundRemainingSeconds(Math.ceil(remainingMs / 1000));
            }
        }, 200);

        return () => window.clearInterval(intervalId);
    }, [activeRound, currentRoomPlayerCount, answeredPlayers.length, closeCurrentRound]);

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
                              }
                            : r,
                    ),
                );

                // Abre imediatamente a 1ª rodada
                const nextRoundResponse = await createNextRoundApi(targetRoom.id);
                if (!nextRoundResponse.finished) {
                    closingRoundIdRef.current = null;
                    setActiveRound(nextRoundResponse.round);
                    setClosedRound(null);
                    setAnsweredPlayers([]);
                    setRoundRemainingSeconds(nextRoundResponse.round.timeLimit);
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
            setActiveRound(result.round);
            setClosedRound(null);
            setAnsweredPlayers([]);
            setRoundRemainingSeconds(result.round.timeLimit);
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

    const closeCreate = useCallback(() => setIsCreateOpen(false), []);

    async function submitRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!name.trim()) {
            setFormError('Dê um nome de identificação para a sala.');
            return;
        }

        if (maxPlayers < 2 || maxPlayers > 50) {
            setFormError('A capacidade deve ser entre 2 e 50 jogadores.');
            return;
        }

        setIsSubmittingRoom(true);
        setFormError(null);

        try {
            if (editingRoom) {
                const updatedApi = await updateRoomApi(editingRoom.id, {
                    maxPlayers,
                    questionTime: timeLimit,
                    gameMode,
                });

                setRooms((current) =>
                    current.map((room) =>
                        room.id === editingRoom.id
                            ? {
                                  ...room,
                                  name: name.trim(),
                                  theme: theme.trim() || DEFAULT_THEME,
                                  timeLimit: updatedApi.questionTime,
                                  maxPlayers: updatedApi.maxPlayers,
                                  gameMode: updatedApi.gameMode,
                              }
                            : room,
                    ),
                );
                setIsCreateOpen(false);
                return;
            }

            const createdApi = await createRoomApi({
                maxPlayers,
                questionTime: timeLimit,
                gameMode,
            });

            const newRoom = mapApiRoomToModel(createdApi, {
                name: name.trim(),
                theme: theme.trim() || DEFAULT_THEME,
                questionIds: [],
            });

            setRooms((current) => [newRoom, ...current]);
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
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Erro ao salvar sala no servidor.',
            );
        } finally {
            setIsSubmittingRoom(false);
        }
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

    function openReport(room: Room, questions: Question[] = []) {
        setReportView({ room, report: buildRoomReport(loadRoomResults(room.id), questions) });
    }

    const closeReport = useCallback(() => setReportView(null), []);
    const showCode = useCallback((room: Room) => setDisplayedRoom(room), []);
    const hideCode = useCallback(() => setDisplayedRoom(null), []);

    return {
        rooms,
        activeRoom,
        selectRoom,
        isLoadingRoom,
        roomActionError,
        clearRoomActionError: () => setRoomActionError(null),
        refreshActiveRoomLobby: () =>
            activeRoom
                ? loadRoomByCode(activeRoom.code, { name: activeRoom.name, theme: activeRoom.theme })
                : Promise.resolve(null),
        lookupCode,
        setLookupCode: (val: string) =>
            setLookupCode(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)),
        handleLookupRoom,
        activeRound,
        closedRound,
        answeredPlayers,
        roundRemainingSeconds,
        isStartingMatch,
        isAdvancingRound,
        minPlayers: MIN_ROOM_PLAYERS,
        minQuestions: MIN_ROOM_QUESTIONS,
        startMatch,
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
        setTheme,
        setTimeLimit,
        setMaxPlayers,
        setGameMode,
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
        reportView,
        openReport,
        closeReport,
        displayedRoom,
        showCode,
        hideCode,
    };
}
