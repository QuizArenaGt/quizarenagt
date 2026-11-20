/*
 * MODEL — resultados de uma sala e relatório do professor.
 *
 * As funções daqui são puras (sem React e sem acesso a dados): recebem os
 * resultados registrados e as perguntas e devolvem os números prontos
 * para a tela. Isso facilita testar e trocar a origem dos dados depois.
 */
import type { OpponentPlayer } from './game';
import type { Question } from './question';
import type {
    ApiGameDetailedResults,
    ApiGameHistoryItem,
    ApiGameStatus,
} from '../services/roomStorageService';

export interface QuestionResult {
    questionId: string;
    isCorrect: boolean;
    points: number;
}

/** Resultado de um participante ao terminar a partida. */
export interface PlayerResult {
    nickname: string;
    isSimulated: boolean;
    answers: QuestionResult[];
}

/** Tudo o que foi registrado sobre uma sala. */
export interface RoomResults {
    /** Perguntas na ordem em que foram jogadas. */
    questionIds: string[];
    /** Participantes simulados da demonstração (fixos por sala). */
    simulatedPlayers: OpponentPlayer[];
    /** Alunos reais que concluíram a partida. */
    players: PlayerResult[];
}

export interface StudentReportRow {
    position: number;
    nickname: string;
    isSimulated: boolean;
    score: number;
    correctCount: number;
    wrongCount: number;
}

export interface QuestionReportRow {
    questionId: string;
    statement: string;
    correctCount: number;
    answeredCount: number;
    /** Taxa de acerto de 0 a 1. */
    correctRate: number;
}

export interface RoomReport {
    participantCount: number;
    realStudentCount: number;
    questionCount: number;
    /** Média de acerto da turma, de 0 a 1. */
    averageCorrectRate: number;
    ranking: StudentReportRow[];
    /** Todas as perguntas da sala, na ordem em que foram jogadas. */
    questionRows: QuestionReportRow[];
    mostCorrectQuestions: QuestionReportRow[];
    mostMissedQuestions: QuestionReportRow[];
    studentsWithMostCorrect: StudentReportRow[];
    studentsWithMostWrong: StudentReportRow[];
}

/** Quantos itens aparecem em cada destaque (mais acertadas, mais erradas...). */
export const REPORT_HIGHLIGHT_SIZE = 3;

/** Converte um jogador simulado para o mesmo formato dos alunos reais. */
function simulatedToResult(player: OpponentPlayer, questionIds: string[]): PlayerResult {
    return {
        nickname: player.nickname,
        isSimulated: true,
        answers: questionIds.map((questionId, index) => {
            const points = player.pointsPerQuestion[index] ?? 0;
            // Pela regra de pontuação, só acertos pontuam (mínimo de 500).
            return { questionId, isCorrect: points > 0, points };
        }),
    };
}

/**
 * Monta o relatório da sala. Devolve null quando nenhum aluno real
 * concluiu a partida (os simulados sozinhos não formam um relatório).
 */
export function buildRoomReport(results: RoomResults | null, questionBank: Question[]): RoomReport | null {
    if (!results || results.players.length === 0) return null;

    const participants: PlayerResult[] = [
        ...results.players,
        ...results.simulatedPlayers.map((player) => simulatedToResult(player, results.questionIds)),
    ];

    // ----- Alunos -----
    const ranking: StudentReportRow[] = participants
        .map((participant) => {
            const correctCount = participant.answers.filter((answer) => answer.isCorrect).length;
            return {
                position: 0,
                nickname: participant.nickname,
                isSimulated: participant.isSimulated,
                score: participant.answers.reduce((sum, answer) => sum + answer.points, 0),
                correctCount,
                // Respostas erradas e tempo esgotado contam como erro.
                wrongCount: results.questionIds.length - correctCount,
            };
        })
        .sort((a, b) => b.score - a.score)
        .map((row, index) => ({ ...row, position: index + 1 }));

    const studentsWithMostCorrect = [...ranking]
        .sort((a, b) => b.correctCount - a.correctCount || b.score - a.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const studentsWithMostWrong = [...ranking]
        .filter((row) => row.wrongCount > 0)
        .sort((a, b) => b.wrongCount - a.wrongCount || a.score - b.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    // ----- Perguntas -----
    const questionRows: QuestionReportRow[] = results.questionIds.map((questionId) => {
        const answers = participants
            .map((participant) => participant.answers.find((answer) => answer.questionId === questionId))
            .filter((answer): answer is QuestionResult => answer !== undefined);
        const correctCount = answers.filter((answer) => answer.isCorrect).length;
        return {
            questionId,
            statement:
                questionBank.find((question) => question.id === questionId)?.statement ??
                'Pergunta removida do banco',
            correctCount,
            answeredCount: answers.length,
            correctRate: answers.length > 0 ? correctCount / answers.length : 0,
        };
    });

    const mostCorrectQuestions = [...questionRows]
        .sort((a, b) => b.correctRate - a.correctRate)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const mostMissedQuestions = [...questionRows]
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const totalAnswers = questionRows.reduce((sum, row) => sum + row.answeredCount, 0);
    const totalCorrect = questionRows.reduce((sum, row) => sum + row.correctCount, 0);

    return {
        participantCount: participants.length,
        realStudentCount: results.players.length,
        questionCount: results.questionIds.length,
        averageCorrectRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
        ranking,
        questionRows,
        mostCorrectQuestions,
        mostMissedQuestions,
        studentsWithMostCorrect,
        studentsWithMostWrong,
    };
}

// ===== Estatísticas gerais (Visão Geral do painel) =====

export interface RoomSummaryRow {
    roomId: string;
    roomName: string;
    isFinished: boolean;
    realStudentCount: number;
    participantCount: number;
    averageCorrectRate: number;
}

export interface OverviewStats {
    /** Salas em que pelo menos um aluno concluiu a partida. */
    quizzesPlayed: number;
    /** Alunos reais que concluíram partidas, somando todas as salas. */
    studentParticipations: number;
    averageCorrectRate: number;
    rooms: RoomSummaryRow[];
    hardestQuestions: QuestionReportRow[];
    easiestQuestions: QuestionReportRow[];
}

/**
 * Consolida os relatórios de todas as salas. As perguntas são somadas por
 * id, então uma pergunta usada em várias salas tem uma única taxa geral.
 */
export function buildOverviewStats(
    rooms: { id: string; name: string; isFinished: boolean; results: RoomResults | null }[],
    questionBank: Question[],
): OverviewStats {
    const playedRooms = rooms
        .map((room) => ({ room, report: buildRoomReport(room.results, questionBank) }))
        .filter((entry): entry is { room: (typeof rooms)[number]; report: RoomReport } => entry.report !== null);

    const questionTotals = new Map<string, QuestionReportRow>();
    for (const { report } of playedRooms) {
        for (const row of report.questionRows) {
            const current = questionTotals.get(row.questionId);
            const correctCount = (current?.correctCount ?? 0) + row.correctCount;
            const answeredCount = (current?.answeredCount ?? 0) + row.answeredCount;
            questionTotals.set(row.questionId, {
                ...row,
                correctCount,
                answeredCount,
                correctRate: answeredCount > 0 ? correctCount / answeredCount : 0,
            });
        }
    }
    const allQuestions = [...questionTotals.values()];

    const totalAnswers = allQuestions.reduce((sum, row) => sum + row.answeredCount, 0);
    const totalCorrect = allQuestions.reduce((sum, row) => sum + row.correctCount, 0);

    return {
        quizzesPlayed: playedRooms.length,
        studentParticipations: playedRooms.reduce((sum, { report }) => sum + report.realStudentCount, 0),
        averageCorrectRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
        rooms: playedRooms.map(({ room, report }) => ({
            roomId: room.id,
            roomName: room.name,
            isFinished: room.isFinished,
            realStudentCount: report.realStudentCount,
            participantCount: report.participantCount,
            averageCorrectRate: report.averageCorrectRate,
        })),
        hardestQuestions: [...allQuestions]
            .sort((a, b) => a.correctRate - b.correctRate)
            .slice(0, REPORT_HIGHLIGHT_SIZE),
        easiestQuestions: [...allQuestions]
            .sort((a, b) => b.correctRate - a.correctRate)
            .slice(0, REPORT_HIGHLIGHT_SIZE),
    };
}

/** Formata uma taxa de 0 a 1 como porcentagem inteira (ex.: "83%"). */
export function formatRate(rate: number): string {
    return `${Math.round(rate * 100)}%`;
}

/** Rótulo legível para o status persistido de uma partida (`GameStatus`). */
export function formatGameStatusLabel(status: ApiGameStatus): string {
    switch (status) {
        case 'WAITING':
            return 'Aguardando';
        case 'IN_PROGRESS':
            return 'Em andamento';
        case 'FINISHED':
            return 'Finalizada';
        case 'CANCELLED':
            return 'Cancelada';
    }
}

/** Formata a duração calculável de uma partida a partir de `durationMs`. */
export function formatGameDuration(
    durationMs: number | null | undefined,
    status?: ApiGameStatus,
): string {
    if (durationMs === null || durationMs === undefined || Number.isNaN(durationMs) || durationMs < 0) {
        return status === 'IN_PROGRESS' || status === 'WAITING'
            ? 'Em aberto'
            : 'Não registrada';
    }

    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }

    if (minutes > 0) {
        return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }

    return `${seconds}s`;
}

/**
 * Converte resultados persistidos de um `Game` específico (`GET /rooms/:id/games/:gameId/results`)
 * para o formato `RoomReport` consumido pelo `RoomReportModal`, mantendo a pontuação oficial de `GamePlayer`.
 */
export function buildRoomReportFromServerGame(
    details: Pick<ApiGameDetailedResults, 'ranking' | 'questions' | 'questionCount'> | null,
): RoomReport | null {
    if (!details || details.ranking.length === 0) {
        return null;
    }

    const ranking: StudentReportRow[] = details.ranking.map((entry) => ({
        position: entry.position,
        nickname: entry.nickname,
        isSimulated: false,
        score: entry.score,
        correctCount: entry.correctCount,
        wrongCount: entry.wrongCount,
    }));

    const studentsWithMostCorrect = [...ranking]
        .sort((a, b) => b.correctCount - a.correctCount || b.score - a.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const studentsWithMostWrong = [...ranking]
        .filter((row) => row.wrongCount > 0)
        .sort((a, b) => b.wrongCount - a.wrongCount || a.score - b.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const questionRows: QuestionReportRow[] = details.questions.map((q) => ({
        questionId: q.questionId,
        statement: q.statement,
        correctCount: q.correctCount,
        answeredCount: q.answeredCount,
        correctRate: q.correctRate,
    }));

    const mostCorrectQuestions = [...questionRows]
        .sort((a, b) => b.correctRate - a.correctRate)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const mostMissedQuestions = [...questionRows]
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const totalAnswers = questionRows.reduce((sum, row) => sum + row.answeredCount, 0);
    const totalCorrect = questionRows.reduce((sum, row) => sum + row.correctCount, 0);

    return {
        participantCount: ranking.length,
        realStudentCount: ranking.length,
        questionCount: details.questionCount,
        averageCorrectRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
        ranking,
        questionRows,
        mostCorrectQuestions,
        mostMissedQuestions,
        studentsWithMostCorrect,
        studentsWithMostWrong,
    };
}

export interface ExecuteLoadRoomGamesParams {
    roomId: string | null;
    requestSeqRef: { current: number };
    fetchRoomGames: (roomId: string) => Promise<ApiGameHistoryItem[]>;
    onLoadingChange?: (loading: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (games: ApiGameHistoryItem[]) => void;
}

/**
 * Carrega o histórico persistido de partidas de uma sala com proteção contra respostas fora de ordem.
 */
export async function executeLoadRoomGames({
    roomId,
    requestSeqRef,
    fetchRoomGames,
    onLoadingChange,
    onError,
    onSuccess,
}: ExecuteLoadRoomGamesParams): Promise<ApiGameHistoryItem[] | null> {
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;

    if (!roomId) {
        onSuccess([]);
        onError(null);
        onLoadingChange?.(false);
        return null;
    }

    onLoadingChange?.(true);
    onError(null);

    try {
        const games = await fetchRoomGames(roomId);
        if (requestSeqRef.current !== seq) {
            return null;
        }
        onSuccess(games);
        return games;
    } catch (error) {
        if (requestSeqRef.current !== seq) {
            return null;
        }
        onError(
            error instanceof Error && error.message.trim()
                ? error.message.trim()
                : 'Não foi possível carregar o histórico de partidas.',
        );
        return null;
    } finally {
        if (requestSeqRef.current === seq) {
            onLoadingChange?.(false);
        }
    }
}

export interface ExecuteOpenGameResultsParams<TRoom> {
    room: TRoom;
    gameId: string;
    requestSeqRef: { current: number };
    fetchGameResults: (roomId: string, gameId: string) => Promise<ApiGameDetailedResults>;
    onStateChange: (view: {
        room: TRoom;
        report: RoomReport | null;
        gameDetails?: ApiGameDetailedResults | null;
        isLoading?: boolean;
        error?: string | null;
    }) => void;
}

/**
 * Consulta os resultados detalhados de uma partida específica no servidor e popula o modal,
 * isolando cada chamada por `gameId` e descartando respostas obsoletas.
 */
export async function executeOpenGameResults<TRoom extends { id: string }>({
    room,
    gameId,
    requestSeqRef,
    fetchGameResults,
    onStateChange,
}: ExecuteOpenGameResultsParams<TRoom>): Promise<ApiGameDetailedResults | null> {
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;

    onStateChange({
        room,
        report: null,
        gameDetails: null,
        isLoading: true,
        error: null,
    });

    try {
        const details = await fetchGameResults(room.id, gameId);
        if (requestSeqRef.current !== seq) {
            return null;
        }

        onStateChange({
            room,
            report: buildRoomReportFromServerGame(details),
            gameDetails: details,
            isLoading: false,
            error: null,
        });

        return details;
    } catch (error) {
        if (requestSeqRef.current !== seq) {
            return null;
        }

        onStateChange({
            room,
            report: null,
            gameDetails: null,
            isLoading: false,
            error:
                error instanceof Error && error.message.trim()
                    ? error.message.trim()
                    : 'Não foi possível carregar os resultados desta partida.',
        });

        return null;
    }
}
