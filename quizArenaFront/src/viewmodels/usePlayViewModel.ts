import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    DEFAULT_PLAYER_AVATAR_ID,
    resolvePlayerAvatarId,
    type PlayerAvatarId,
} from '../models/avatars';
import {
    createCleanPlayerMatchState,
    executeLeaveRoom,
    executeRecoverPlayerSession,
    executeVerifyRoomCode,
    formatRoomAvailabilityError,
    mapLobbyToPlayerGameRoom,
    NICKNAME_MAX_LENGTH,
    NICKNAME_MIN_LENGTH,
    normalizeRoomCodeInput,
    shouldClearPlayerSessionOnError,
    type GameRoom,
    type PlayPhase,
    type PlayerAnswer,
    type RankingEntry,
} from '../models/game';
import type { Question } from '../models/question';
import {
    fetchPlayerLobby,
    joinRoomWithNickname,
    leaveRoomSession,
    submitPlayerRoundAnswer,
    verifyRoomAvailability,
} from '../services/gameRoomService';
import {
    clearPlayerSession,
    loadPlayerSession,
    savePlayerSession,
} from '../services/playerSessionStorage';
import { computeRemainingSecondsFromDeadline } from '../models/room';
import { subscribeServerClock } from '../services/serverClock';
import type { ApiRoomLobby } from '../services/roomStorageService';
import {
    createPlayerSocket,
    syncSocketClock,
    type GameFinishedPayload,
    type LobbyPlayerDto,
    type PlayerJoinedPayload,
    type PlayerLeftPayload,
    type RoomUpdatedPayload,
    type RoundClosedPayload,
    type RoundStartedPayload,
} from '../services/socket';

const TIMER_TICK_MS = 200;

export type PlayerSocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function usePlayViewModel() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [phase, setPhase] = useState<PlayPhase>('join');
    const [pin, setPinState] = useState(() => normalizeRoomCodeInput(searchParams.get('codigo') ?? ''));
    const [nickname, setNickname] = useState('');
    const [avatarId, setAvatarId] = useState<PlayerAvatarId>(() => {
        const persisted = loadPlayerSession();
        return persisted ? resolvePlayerAvatarId(persisted.avatarId) : DEFAULT_PLAYER_AVATAR_ID;
    });
    const [room, setRoom] = useState<GameRoom | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayerDto[]>([]);

    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [isRecovering, setIsRecovering] = useState(() => loadPlayerSession() !== null);
    const [canConnectSocket, setCanConnectSocket] = useState(false);
    const [rawSocketStatus, setRawSocketStatus] = useState<PlayerSocketStatus>('connecting');
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [isLeaving, setIsLeaving] = useState(false);
    const [leaveError, setLeaveError] = useState<string | null>(null);

    // Estado da rodada e perguntas recebidas do servidor
    const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [currentTimeLimit, setCurrentTimeLimit] = useState(30);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

    // Submissão de resposta na rodada aberta
    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
    const [answerError, setAnswerError] = useState<string | null>(null);

    // Histórico consolidado exclusivamente a partir de round:closed (servidor)
    const [playedQuestions, setPlayedQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<PlayerAnswer[]>([]);
    const [serverRanking, setServerRanking] = useState<RankingEntry[]>([]);
    const [serverTotalScore, setServerTotalScore] = useState(0);
    const [isGameCancelled, setIsGameCancelled] = useState(false);

    const roundTimingRef = useRef<{
        expiresAt?: string;
        openedAt: string;
        timeLimit: number;
    } | null>(null);
    const playerSocketRef = useRef<ReturnType<typeof createPlayerSocket> | null>(null);
    const hasAnsweredRef = useRef(false);
    const currentRoundIdRef = useRef<string | null>(null);
    const currentQuestionTypeRef = useRef<Question['type']>('MULTIPLE_CHOICE');
    const isCheckingPinRef = useRef(false);
    const isRecoveringRef = useRef(false);
    const isLeavingRef = useRef(false);

    const lastAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
    const correctCount = useMemo(
        () => answers.filter((ans) => ans.isCorrect).length,
        [answers],
    );
    const playerRanking = useMemo(
        () => serverRanking.find((entry) => entry.isCurrentPlayer) ?? null,
        [serverRanking],
    );

    // ===== Entrada na sala (Passo 1: Código + Disponibilidade -> Passo 2: Apelido + POST /rooms/join) =====

    function setPin(value: string) {
        setPinState(normalizeRoomCodeInput(value));
        setError(null);
    }

    async function submitPin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await executeVerifyRoomCode({
            rawCode: pin,
            lockRef: isCheckingPinRef,
            checkAvailability: verifyRoomAvailability,
            setIsLoading: setIsJoining,
            setError,
            onNormalizedCode: setPinState,
            onSuccess: () => {
                setPhase('nickname');
            },
        });
    }

    function changeNickname(value: string) {
        setNickname(value.slice(0, NICKNAME_MAX_LENGTH));
        setError(null);
    }

    async function submitNickname(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isCheckingPinRef.current) return;

        const trimmedNickname = nickname.trim();
        if (trimmedNickname.length < NICKNAME_MIN_LENGTH) {
            setError(`O apelido precisa ter pelo menos ${NICKNAME_MIN_LENGTH} caracteres.`);
            return;
        }

        isCheckingPinRef.current = true;
        setIsJoining(true);
        setError(null);

        try {
            const session = await joinRoomWithNickname(pin, trimmedNickname, avatarId);
            const resolvedGameId =
                session.player.gameId ?? session.lobby.currentGame?.id ?? '';
            const resolvedAvatar = resolvePlayerAvatarId(session.player.avatarId ?? avatarId);

            if (resolvedGameId) {
                savePlayerSession({
                    sessionToken: session.sessionToken,
                    roomCode: session.lobby.code,
                    roomId: session.lobby.id,
                    gameId: resolvedGameId,
                    playerId: session.player.id,
                    nickname: session.player.nickname,
                    avatarId: resolvedAvatar,
                });
            }

            setNickname(session.player.nickname);
            setAvatarId(resolvedAvatar);
            setPlayerId(session.player.id);
            setLobbyPlayers(session.lobby.players);
            setTotalQuestions(session.lobby.currentGame?.totalQuestions ?? 0);
            setCurrentTimeLimit(session.lobby.questionTime);
            setRoom(mapLobbyToPlayerGameRoom(session.lobby));
            setCanConnectSocket(true);
            setSessionToken(session.sessionToken);
            setIsGameCancelled(false);
            setPhase('lobby');
        } catch (joinErr) {
            setError(formatRoomAvailabilityError(joinErr));
        } finally {
            isCheckingPinRef.current = false;
            setIsJoining(false);
        }
    }

    // ===== Aplicação de estado e Recuperação de Sessão =====

    const applyRoundClosed = useCallback(
        (payload: RoundClosedPayload, activePlayerId: string | null = playerId) => {
            const { round } = payload;

            const revealedQuestion: Question = {
                id: round.question.id,
                statement: round.question.statement,
                type: currentQuestionTypeRef.current,
                isActive: true,
                theme: 'Geral',
                options: round.question.options.map((opt) => ({
                    id: opt.id,
                    text: opt.text,
                    isCorrect: opt.isCorrect,
                })),
            };

            const myServerAnswer = round.answers.find((ans) => ans.player.id === activePlayerId);

            const roundAnswer: PlayerAnswer = {
                questionId: round.question.id,
                selectedOptionId: myServerAnswer ? myServerAnswer.option.id : null,
                isCorrect: myServerAnswer ? myServerAnswer.isCorrect : false,
                points: myServerAnswer ? myServerAnswer.points : 0,
            };

            const updatedRanking: RankingEntry[] = round.ranking.map((entry, idx) => ({
                position: idx + 1,
                nickname: entry.nickname,
                avatarId: resolvePlayerAvatarId(entry.avatarId),
                score: entry.score,
                isCurrentPlayer: entry.id === activePlayerId,
            }));

            const myRankingEntry = round.ranking.find((entry) => entry.id === activePlayerId);

            setCurrentQuestion(revealedQuestion);
            setPlayedQuestions((current) => {
                const exists = current.some((q) => q.id === revealedQuestion.id);
                return exists
                    ? current.map((q) => (q.id === revealedQuestion.id ? revealedQuestion : q))
                    : [...current, revealedQuestion];
            });
            setAnswers((current) => {
                const exists = current.some((a) => a.questionId === roundAnswer.questionId);
                return exists
                    ? current.map((a) =>
                          a.questionId === roundAnswer.questionId ? roundAnswer : a,
                      )
                    : [...current, roundAnswer];
            });
            setServerRanking(updatedRanking);
            if (myRankingEntry) {
                setServerTotalScore(myRankingEntry.score);
            }
            roundTimingRef.current = null;
            setRemainingSeconds(0);
            setPhase('feedback');
        },
        [playerId],
    );

    const applyRoundStarted = useCallback((round: RoundStartedPayload['round']) => {
        roundTimingRef.current = {
            expiresAt: round.expiresAt,
            openedAt: round.openedAt,
            timeLimit: round.timeLimit,
        };

        if (typeof round.timeLimit === 'number' && round.timeLimit > 0) {
            setCurrentTimeLimit(round.timeLimit);
        }

        const nextRemainingSeconds = computeRemainingSecondsFromDeadline(
            round.expiresAt,
            round.openedAt,
            round.timeLimit,
        );

        if (currentRoundIdRef.current === round.id) {
            setRemainingSeconds(nextRemainingSeconds);
            return;
        }

        currentRoundIdRef.current = round.id;
        hasAnsweredRef.current = false;
        currentQuestionTypeRef.current = round.question.type;

        setCurrentRoundId(round.id);
        setQuestionNumber(round.roundNumber);
        setRemainingSeconds(nextRemainingSeconds);
        setSelectedOptionId(null);
        setHasSubmittedAnswer(false);
        setIsSubmittingAnswer(false);
        setAnswerError(null);

        // As alternativas enviadas em round:started não possuem gabarito (isCorrect)
        setCurrentQuestion({
            id: round.question.id,
            statement: round.question.statement,
            type: round.question.type,
            isActive: true,
            theme: 'Geral',
            options: round.question.options.map((opt) => ({
                id: opt.id,
                text: opt.text,
                isCorrect: false,
            })),
        });

        setPhase('question');
    }, []);

    const applyLobbySnapshot = useCallback(
        (lobby: ApiRoomLobby, activePlayerId: string | null) => {
            setLobbyPlayers(lobby.players);
            const meInLobby = activePlayerId
                ? lobby.players.find((p) => p.id === activePlayerId)
                : undefined;
            if (meInLobby?.avatarId) {
                setAvatarId(resolvePlayerAvatarId(meInLobby.avatarId));
            }
            setCurrentTimeLimit(lobby.questionTime);
            setPinState(lobby.code);
            setRoom(mapLobbyToPlayerGameRoom(lobby));

            const cg = lobby.currentGame;
            if (!cg) {
                setPhase('lobby');
                return;
            }

            setTotalQuestions(cg.totalQuestions ?? 0);

            const meInGame = cg.players?.find((entry) => entry.id === activePlayerId);
            if (meInGame) {
                setServerTotalScore(meInGame.score);
            }

            if (cg.status === 'WAITING') {
                setPhase('lobby');
                return;
            }

            if (cg.status === 'IN_PROGRESS') {
                if (cg.activeRound && cg.activeRound.status === 'OPEN') {
                    applyRoundStarted({
                        id: cg.activeRound.id,
                        roundNumber: cg.activeRound.roundNumber,
                        status: cg.activeRound.status,
                        openedAt: cg.activeRound.openedAt,
                        expiresAt: cg.activeRound.expiresAt,
                        timeLimit: cg.activeRound.timeLimit,
                        question: cg.activeRound.question,
                    });

                    const alreadyAnswered =
                        cg.activeRound.answeredPlayers?.some(
                            (entry) => entry.id === activePlayerId,
                        ) ?? false;
                    if (alreadyAnswered) {
                        hasAnsweredRef.current = true;
                        setHasSubmittedAnswer(true);
                    }
                    return;
                }

                if (cg.lastClosedRound) {
                    applyRoundClosed({ round: cg.lastClosedRound }, activePlayerId);
                    return;
                }

                setPhase('lobby');
                return;
            }

            if (cg.status === 'FINISHED' || cg.status === 'CANCELLED') {
                if (cg.lastClosedRound) {
                    applyRoundClosed({ round: cg.lastClosedRound }, activePlayerId);
                }

                if (!cg.lastClosedRound && Array.isArray(cg.players) && cg.players.length > 0) {
                    const sorted = [...cg.players].sort((a, b) => b.score - a.score);
                    const updatedRanking: RankingEntry[] = sorted.map((entry, idx) => ({
                        position: idx + 1,
                        nickname: entry.nickname,
                        avatarId: resolvePlayerAvatarId(entry.avatarId),
                        score: entry.score,
                        isCurrentPlayer: entry.id === activePlayerId,
                    }));
                    setServerRanking(updatedRanking);
                    const me = sorted.find((entry) => entry.id === activePlayerId);
                    if (me) {
                        setServerTotalScore(me.score);
                    }
                }

                currentRoundIdRef.current = null;
                roundTimingRef.current = null;
                setCurrentRoundId(null);
                setIsSubmittingAnswer(false);
                setRemainingSeconds(0);
                setCanConnectSocket(false);
                setIsGameCancelled(cg.status === 'CANCELLED');
                setPhase('finished');
            }
        },
        [applyRoundClosed, applyRoundStarted],
    );

    // Recuperação automática idempotente ao abrir ou recarregar /jogar (HTTP antes do Socket.IO)
    useEffect(() => {
        let cancelled = false;
        const persistedSession = loadPlayerSession();

        void executeRecoverPlayerSession({
            persistedSession,
            lockRef: isRecoveringRef,
            fetchLobby: fetchPlayerLobby,
            setIsRecovering: (value) => {
                if (!cancelled) setIsRecovering(value);
            },
            setError: (value) => {
                if (!cancelled) setError(value);
            },
            onRecovered: (lobby, recovered) => {
                if (cancelled) return;

                setPlayerId(recovered.playerId);
                setNickname(
                    lobby.currentGame?.players?.find((p) => p.id === recovered.playerId)
                        ?.nickname ?? recovered.nickname,
                );
                setAvatarId(
                    resolvePlayerAvatarId(
                        lobby.players.find((p) => p.id === recovered.playerId)?.avatarId ??
                            lobby.currentGame?.players?.find((p) => p.id === recovered.playerId)
                                ?.avatarId ??
                            recovered.avatarId,
                    ),
                );
                applyLobbySnapshot(lobby, recovered.playerId);

                const status = lobby.currentGame?.status;
                const isLiveMatch = status === 'WAITING' || status === 'IN_PROGRESS';
                setCanConnectSocket(isLiveMatch);
                setSessionToken(recovered.sessionToken);
            },
            onSessionInvalid: () => {
                if (cancelled) return;
                clearPlayerSession();
                setCanConnectSocket(false);
                setSessionToken(null);
                setPlayerId(null);
                setRoom(null);
                setLobbyPlayers([]);
                setPhase('join');
                navigate('/', { replace: true });
            },
        });

        return () => {
            cancelled = true;
            isRecoveringRef.current = false;
        };
    }, [applyLobbySnapshot, navigate]);

    // ===== Conexão Socket.IO em Tempo Real do Jogador =====

    useEffect(() => {
        if (!sessionToken || !playerId || !canConnectSocket) return;

        const roomCode = room?.pin ?? pin;
        const socket = createPlayerSocket(sessionToken);
        playerSocketRef.current = socket;
        let hasConnectedOnce = false;

        socket.on('connect', () => {
            setRawSocketStatus('connected');
            void syncSocketClock(socket);
            if (!hasConnectedOnce) {
                hasConnectedOnce = true;
                return;
            }

            if (!roomCode) return;

            void fetchPlayerLobby(roomCode, sessionToken)
                .then((lobby) => {
                    applyLobbySnapshot(lobby, playerId);
                })
                .catch((err) => {
                    if (shouldClearPlayerSessionOnError(err)) {
                        clearPlayerSession();
                        setCanConnectSocket(false);
                        setSessionToken(null);
                        setPlayerId(null);
                        setRoom(null);
                        setLobbyPlayers([]);
                        setPhase('join');
                        navigate('/', { replace: true });
                    }
                });
        });

        socket.on('disconnect', () => {
            setRawSocketStatus('reconnecting');
        });

        socket.on('connect_error', () => {
            setRawSocketStatus('reconnecting');
        });

        socket.on('player:joined', (payload: PlayerJoinedPayload) => {
            setLobbyPlayers((current) => {
                const exists = current.some((p) => p.id === payload.player.id);
                return exists
                    ? current.map((p) => (p.id === payload.player.id ? payload.player : p))
                    : [...current, payload.player];
            });
        });

        socket.on('player:left', (payload: PlayerLeftPayload) => {
            if (payload.player.id === playerId) return;
            setLobbyPlayers((current) => current.filter((p) => p.id !== payload.player.id));
        });

        socket.on('room:updated', (payload: RoomUpdatedPayload) => {
            setCurrentTimeLimit(payload.questionTime);
            setRoom((current) =>
                current
                    ? {
                          ...current,
                          timePerQuestion: payload.questionTime,
                      }
                    : current,
            );
        });

        socket.on('round:started', (payload: RoundStartedPayload) => {
            applyRoundStarted(payload.round);
        });

        socket.on('round:closed', (payload: RoundClosedPayload) => {
            applyRoundClosed(payload, playerId);
        });

        socket.on('game:finished', (payload?: GameFinishedPayload) => {
            if (Array.isArray(payload?.ranking) && payload.ranking.length > 0) {
                const updatedRanking: RankingEntry[] = payload.ranking.map((entry, idx) => ({
                    position: entry.position ?? idx + 1,
                    nickname: entry.nickname,
                    avatarId: resolvePlayerAvatarId(entry.avatarId),
                    score: entry.score,
                    isCurrentPlayer: entry.id === playerId,
                }));
                setServerRanking(updatedRanking);
                const myEntry = payload.ranking.find((entry) => entry.id === playerId);
                if (myEntry) {
                    setServerTotalScore(myEntry.score);
                }
            }
            currentRoundIdRef.current = null;
            roundTimingRef.current = null;
            setCurrentRoundId(null);
            setIsSubmittingAnswer(false);
            setRemainingSeconds(0);
            setCanConnectSocket(false);
            setIsGameCancelled(payload?.status === 'CANCELLED');
            setPhase('finished');
        });

        return () => {
            if (playerSocketRef.current === socket) {
                playerSocketRef.current = null;
            }
            socket.removeAllListeners();
            socket.disconnect();
        };
    }, [
        applyLobbySnapshot,
        applyRoundClosed,
        applyRoundStarted,
        canConnectSocket,
        navigate,
        pin,
        playerId,
        room?.pin,
        sessionToken,
    ]);

    // ===== Submissão de resposta ao Servidor (POST /rounds/:id/answer) =====

    const answer = useCallback(
        async (optionId: string) => {
            if (
                !currentRoundId ||
                !sessionToken ||
                hasAnsweredRef.current ||
                isSubmittingAnswer
            ) {
                return;
            }

            hasAnsweredRef.current = true;
            setSelectedOptionId(optionId);
            setIsSubmittingAnswer(true);
            setAnswerError(null);

            try {
                await submitPlayerRoundAnswer(currentRoundId, optionId, sessionToken);
                setHasSubmittedAnswer(true);
            } catch (err) {
                hasAnsweredRef.current = false;
                setSelectedOptionId(null);
                setAnswerError(
                    err instanceof Error
                        ? err.message
                        : 'Não foi possível enviar sua resposta.',
                );
            } finally {
                setIsSubmittingAnswer(false);
            }
        },
        [currentRoundId, sessionToken, isSubmittingAnswer],
    );

    // Cronômetro visual monotônico durante a pergunta aberta
    useEffect(() => {
        if (phase !== 'question') return;

        const updateVisualCountdown = (): number | null => {
            const timing = roundTimingRef.current;
            const nextRemaining = timing
                ? computeRemainingSecondsFromDeadline(
                      timing.expiresAt,
                      timing.openedAt,
                      timing.timeLimit,
                  )
                : null;
            setRemainingSeconds(nextRemaining);
            return nextRemaining;
        };

        updateVisualCountdown();

        const unsubscribeClock = subscribeServerClock(() => {
            updateVisualCountdown();
        });

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                updateVisualCountdown();
                if (playerSocketRef.current?.connected) {
                    void syncSocketClock(playerSocketRef.current).then(() => {
                        updateVisualCountdown();
                    });
                }
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const intervalId = window.setInterval(() => {
            updateVisualCountdown();
        }, TIMER_TICK_MS);

        return () => {
            window.clearInterval(intervalId);
            unsubscribeClock();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [phase, currentRoundId]);

    const resetToJoin = useCallback(() => {
        clearPlayerSession();
        const clean = createCleanPlayerMatchState();
        roundTimingRef.current = null;
        hasAnsweredRef.current = false;
        currentRoundIdRef.current = null;
        setCurrentTimeLimit(30);
        setRemainingSeconds(null);
        setCanConnectSocket(false);
        setRawSocketStatus('connecting');
        setIsRecovering(false);
        setSessionToken(clean.sessionToken);
        setPlayerId(clean.playerId);
        setNickname(clean.nickname);
        setRoom(clean.room);
        setLobbyPlayers(clean.lobbyPlayers);
        setTotalQuestions(0);
        setCurrentRoundId(clean.currentRoundId);
        setCurrentQuestion(clean.currentQuestion);
        setQuestionNumber(clean.questionNumber);
        setSelectedOptionId(clean.selectedOptionId);
        setHasSubmittedAnswer(clean.hasSubmittedAnswer);
        setIsSubmittingAnswer(clean.isSubmittingAnswer);
        setAnswerError(clean.answerError);
        setPlayedQuestions(clean.playedQuestions);
        setAnswers(clean.answers);
        setServerRanking(clean.serverRanking);
        setServerTotalScore(clean.serverTotalScore);
        setIsGameCancelled(false);
        setAvatarId(DEFAULT_PLAYER_AVATAR_ID);
        setPinState(clean.pin);
        setError(clean.error);
        setLeaveError(null);
        setPhase(clean.phase);
    }, []);

    const leaveRoom = useCallback(async () => {
        await executeLeaveRoom({
            phase,
            sessionToken,
            lockRef: isLeavingRef,
            requestLeave: leaveRoomSession,
            setIsLeaving,
            setError: setLeaveError,
            onLeft: () => {
                resetToJoin();
                navigate('/');
            },
        });
    }, [navigate, phase, resetToJoin, sessionToken]);

    function selectAvatar(nextAvatarId: PlayerAvatarId) {
        setAvatarId(resolvePlayerAvatarId(nextAvatarId));
        setError(null);
    }

    const socketStatus: PlayerSocketStatus = canConnectSocket ? rawSocketStatus : 'idle';

    return {
        phase,
        room,
        playerId,
        avatarId,
        lobbyPlayers,
        socketStatus,
        error,
        isJoining,
        isRecovering,
        isLeaving,
        leaveError,
        pin,
        nickname,
        currentQuestion,
        questionNumber,
        totalQuestions,
        currentTimeLimit,
        remainingSeconds,
        selectedOptionId,
        hasSubmittedAnswer,
        isSubmittingAnswer,
        answerError,
        lastAnswer,
        playedQuestions,
        answers,
        totalScore: serverTotalScore,
        correctCount,
        ranking: serverRanking,
        playerRanking,
        isGameCancelled,
        setPin,
        submitPin,
        changeNickname,
        selectAvatar,
        submitNickname,
        answer,
        playAgain: resetToJoin,
        leaveRoom,
    };
}
