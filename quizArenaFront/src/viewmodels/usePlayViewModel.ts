import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    NICKNAME_MAX_LENGTH,
    NICKNAME_MIN_LENGTH,
    normalizeRoomCode,
    validateRoomCode,
    type GameRoom,
    type PlayPhase,
    type PlayerAnswer,
    type RankingEntry,
} from '../models/game';
import type { Question } from '../models/question';
import { joinRoomWithNickname, submitPlayerRoundAnswer } from '../services/gameRoomService';
import {
    createPlayerSocket,
    type LobbyPlayerDto,
    type PlayerJoinedPayload,
    type RoomUpdatedPayload,
    type RoundClosedPayload,
    type RoundStartedPayload,
} from '../services/socket';

const TIMER_TICK_MS = 200;

export function usePlayViewModel() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [phase, setPhase] = useState<PlayPhase>('join');
    const [pin, setPinState] = useState(() => normalizeRoomCode(searchParams.get('codigo') ?? ''));
    const [nickname, setNickname] = useState('');
    const [room, setRoom] = useState<GameRoom | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayerDto[]>([]);

    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);

    // Estado da rodada e perguntas recebidas do servidor
    const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [currentTimeLimit, setCurrentTimeLimit] = useState(30);
    const [remainingSeconds, setRemainingSeconds] = useState(0);

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

    const deadlineRef = useRef(0);
    const hasAnsweredRef = useRef(false);
    const currentQuestionTypeRef = useRef<Question['type']>('MULTIPLE_CHOICE');

    const lastAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
    const correctCount = useMemo(
        () => answers.filter((ans) => ans.isCorrect).length,
        [answers],
    );
    const playerRanking = useMemo(
        () => serverRanking.find((entry) => entry.isCurrentPlayer) ?? null,
        [serverRanking],
    );

    // ===== Entrada na sala (Passo 1: Código -> Passo 2: Apelido + POST /rooms/join) =====

    function setPin(value: string) {
        setPinState(normalizeRoomCode(value));
        setError(null);
    }

    function submitPin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalizedPin = normalizeRoomCode(pin);
        const validationError = validateRoomCode(normalizedPin);
        if (validationError) {
            setError(validationError);
            return;
        }
        setPinState(normalizedPin);
        setError(null);
        setPhase('nickname');
    }

    function changeNickname(value: string) {
        setNickname(value.slice(0, NICKNAME_MAX_LENGTH));
        setError(null);
    }

    async function submitNickname(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmedNickname = nickname.trim();
        if (trimmedNickname.length < NICKNAME_MIN_LENGTH) {
            setError(`O apelido precisa ter pelo menos ${NICKNAME_MIN_LENGTH} caracteres.`);
            return;
        }

        setIsJoining(true);
        setError(null);

        try {
            const session = await joinRoomWithNickname(pin, trimmedNickname);
            setNickname(session.player.nickname);
            setPlayerId(session.player.id);
            setSessionToken(session.sessionToken);
            setLobbyPlayers(session.lobby.players);
            setCurrentTimeLimit(session.lobby.questionTime);
            setRoom({
                pin: session.lobby.code,
                roomId: session.lobby.id,
                title: `Sala de ${session.lobby.host.name}`,
                timePerQuestion: session.lobby.questionTime,
                questions: [],
                opponents: [],
                isDemo: false,
            });
            setPhase('lobby');
        } catch (joinErr) {
            setError(
                joinErr instanceof Error
                    ? joinErr.message
                    : 'Não foi possível entrar na sala. Verifique o código e tente novamente.',
            );
        } finally {
            setIsJoining(false);
        }
    }

    // ===== Conexão Socket.IO em Tempo Real do Jogador =====

    useEffect(() => {
        if (!sessionToken || !playerId) return;

        const socket = createPlayerSocket(sessionToken);

        socket.on('player:joined', (payload: PlayerJoinedPayload) => {
            setLobbyPlayers((current) => {
                const exists = current.some((p) => p.id === payload.player.id);
                return exists
                    ? current.map((p) => (p.id === payload.player.id ? payload.player : p))
                    : [...current, payload.player];
            });
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
            const { round } = payload;
            hasAnsweredRef.current = false;
            currentQuestionTypeRef.current = round.question.type;

            const openedAtMs = new Date(round.openedAt).getTime();
            const deadlineMs = openedAtMs + round.timeLimit * 1000;
            deadlineRef.current = deadlineMs;

            const initialRemaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));

            setCurrentRoundId(round.id);
            setQuestionNumber(round.roundNumber);
            setCurrentTimeLimit(round.timeLimit);
            setRemainingSeconds(initialRemaining);
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
        });

        socket.on('round:closed', (payload: RoundClosedPayload) => {
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

            const myServerAnswer = round.answers.find((ans) => ans.player.id === playerId);

            const roundAnswer: PlayerAnswer = {
                questionId: round.question.id,
                selectedOptionId: myServerAnswer ? myServerAnswer.option.id : null,
                isCorrect: myServerAnswer ? myServerAnswer.isCorrect : false,
                points: myServerAnswer ? myServerAnswer.points : 0,
            };

            const updatedRanking: RankingEntry[] = round.ranking.map((entry, idx) => ({
                position: idx + 1,
                nickname: entry.nickname,
                score: entry.score,
                isCurrentPlayer: entry.id === playerId,
            }));

            const myRankingEntry = round.ranking.find((entry) => entry.id === playerId);

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
            setRemainingSeconds(0);
            setPhase('feedback');
        });

        socket.on('game:finished', () => {
            setRemainingSeconds(0);
            setPhase('finished');
        });

        return () => {
            socket.disconnect();
        };
    }, [sessionToken, playerId]);

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

    // Cronômetro visual durante a pergunta aberta
    useEffect(() => {
        if (phase !== 'question') return;

        const intervalId = window.setInterval(() => {
            const timeLeftMs = deadlineRef.current - Date.now();
            if (timeLeftMs <= 0) {
                setRemainingSeconds(0);
                window.clearInterval(intervalId);
            } else {
                setRemainingSeconds(Math.ceil(timeLeftMs / 1000));
            }
        }, TIMER_TICK_MS);

        return () => window.clearInterval(intervalId);
    }, [phase, currentRoundId]);

    function resetToJoin() {
        setSessionToken(null);
        setPlayerId(null);
        setRoom(null);
        setLobbyPlayers([]);
        setPlayedQuestions([]);
        setAnswers([]);
        setServerRanking([]);
        setServerTotalScore(0);
        setPinState('');
        setError(null);
        setPhase('join');
    }

    function leaveRoom() {
        navigate('/');
    }

    return {
        phase,
        room,
        playerId,
        lobbyPlayers,
        error,
        isJoining,
        pin,
        nickname,
        currentQuestion,
        questionNumber,
        totalQuestions: 0,
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
        setPin,
        submitPin,
        changeNickname,
        submitNickname,
        answer,
        playAgain: resetToJoin,
        leaveRoom,
    };
}
