import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    NICKNAME_MAX_LENGTH,
    NICKNAME_MIN_LENGTH,
    PIN_LENGTH,
    buildRanking,
    calculatePoints,
    sanitizePin,
    type GameRoom,
    type PlayPhase,
    type PlayerAnswer,
} from '../models/game';
import { joinRoom } from '../services/gameRoomService';
import { savePlayerResult } from '../services/roomResultsService';

/** Intervalo de atualização do cronômetro (ms). */
const TIMER_TICK_MS = 200;

/*
 * VIEWMODEL da experiência do aluno (rota /jogar).
 *
 * Funciona como uma máquina de estados (PlayPhase):
 *   join → nickname → lobby → question ⇄ feedback → finished
 *
 * Responsabilidades: validar código e apelido, entrar na sala pelo
 * gameRoomService, controlar o cronômetro de cada pergunta, registrar as
 * respostas e calcular a pontuação (regra no Model: calculatePoints).
 *
 * Observação: na demonstração não há professor conduzindo a partida;
 * o próprio aluno inicia a partida e avança entre as perguntas.
 */
export function usePlayViewModel() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [phase, setPhase] = useState<PlayPhase>('join');
    // O código pode chegar pela URL (/jogar?codigo=123456), vindo da landing page.
    const [pin, setPinState] = useState(() => sanitizePin(searchParams.get('codigo') ?? ''));
    const [nickname, setNickname] = useState('');
    const [room, setRoom] = useState<GameRoom | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<PlayerAnswer[]>([]);
    const [remainingSeconds, setRemainingSeconds] = useState(0);

    // Momento em que o tempo da pergunta atual termina.
    const deadlineRef = useRef(0);
    // Impede que um clique duplo registre duas respostas na mesma pergunta.
    const hasAnsweredRef = useRef(false);

    const currentQuestion = room?.questions[questionIndex] ?? null;
    const totalQuestions = room?.questions.length ?? 0;
    const lastAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
    const isLastQuestion = questionIndex >= totalQuestions - 1;

    const totalScore = useMemo(() => answers.reduce((sum, answer) => sum + answer.points, 0), [answers]);
    const correctCount = useMemo(() => answers.filter((answer) => answer.isCorrect).length, [answers]);

    // Ranking considerando apenas as perguntas já respondidas pelo aluno,
    // para que a comparação com os demais seja sempre na mesma rodada.
    const ranking = useMemo(
        () => buildRanking({ nickname, score: totalScore }, room?.opponents ?? [], answers.length),
        [nickname, totalScore, room, answers.length],
    );
    const playerRanking = ranking.find((entry) => entry.isCurrentPlayer) ?? null;

    // ===== Entrada na sala =====

    function setPin(value: string) {
        setPinState(sanitizePin(value));
        setError(null);
    }

    async function submitPin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pin.length !== PIN_LENGTH) {
            setError(`O código da sala tem ${PIN_LENGTH} dígitos.`);
            return;
        }

        setIsJoining(true);
        setError(null);
        try {
            setRoom(await joinRoom(pin));
            setPhase('nickname');
        } catch (joinError) {
            setError(joinError instanceof Error ? joinError.message : 'Não foi possível entrar na sala.');
        } finally {
            setIsJoining(false);
        }
    }

    function changeNickname(value: string) {
        setNickname(value.slice(0, NICKNAME_MAX_LENGTH));
        setError(null);
    }

    function submitNickname(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (nickname.trim().length < NICKNAME_MIN_LENGTH) {
            setError(`O apelido precisa ter pelo menos ${NICKNAME_MIN_LENGTH} caracteres.`);
            return;
        }
        setNickname(nickname.trim());
        setPhase('lobby');
    }

    // ===== Partida =====

    const startQuestion = useCallback(
        (index: number) => {
            if (!room) return;
            hasAnsweredRef.current = false;
            deadlineRef.current = Date.now() + room.timePerQuestion * 1000;
            setQuestionIndex(index);
            setRemainingSeconds(room.timePerQuestion);
            setPhase('question');
        },
        [room],
    );

    function startGame() {
        setAnswers([]);
        startQuestion(0);
    }

    /** Registra a resposta (ou null quando o tempo acaba) e mostra o resultado. */
    const answer = useCallback(
        (optionId: string | null) => {
            if (!room || !currentQuestion || hasAnsweredRef.current) return;
            hasAnsweredRef.current = true;

            const correctOption = currentQuestion.options.find((option) => option.isCorrect);
            const isCorrect = optionId !== null && optionId === correctOption?.id;
            const timeLeftMs = Math.max(0, deadlineRef.current - Date.now());

            setAnswers((current) => [
                ...current,
                {
                    questionId: currentQuestion.id,
                    selectedOptionId: optionId,
                    isCorrect,
                    points: calculatePoints(isCorrect, timeLeftMs, room.timePerQuestion * 1000),
                },
            ]);
            setPhase('feedback');
        },
        [room, currentQuestion],
    );

    // Cronômetro: roda apenas durante a fase de pergunta. O tempo restante
    // é calculado a partir do prazo (deadline), e não somando ticks, para
    // não acumular atraso caso o navegador atrase o intervalo.
    useEffect(() => {
        if (phase !== 'question') return;

        const intervalId = window.setInterval(() => {
            const timeLeftMs = deadlineRef.current - Date.now();
            if (timeLeftMs <= 0) {
                window.clearInterval(intervalId);
                answer(null);
            } else {
                setRemainingSeconds(Math.ceil(timeLeftMs / 1000));
            }
        }, TIMER_TICK_MS);

        return () => window.clearInterval(intervalId);
    }, [phase, answer]);

    function goToNext() {
        if (isLastQuestion) {
            // Ao concluir uma sala do professor, o resultado é registrado
            // para o relatório da sala (a sala 123456 não gera relatório).
            if (room?.roomId) {
                savePlayerResult(room.roomId, {
                    nickname,
                    isSimulated: false,
                    answers: answers.map(({ questionId, isCorrect, points }) => ({ questionId, isCorrect, points })),
                });
            }
            setPhase('finished');
        } else {
            startQuestion(questionIndex + 1);
        }
    }

    function leaveRoom() {
        navigate('/');
    }

    return {
        phase,
        room,
        error,
        isJoining,
        pin,
        nickname,
        currentQuestion,
        questionNumber: questionIndex + 1,
        totalQuestions,
        remainingSeconds,
        lastAnswer,
        answers,
        totalScore,
        correctCount,
        ranking,
        playerRanking,
        isLastQuestion,
        setPin,
        submitPin,
        changeNickname,
        submitNickname,
        startGame,
        answer,
        goToNext,
        playAgain: startGame,
        leaveRoom,
    };
}
