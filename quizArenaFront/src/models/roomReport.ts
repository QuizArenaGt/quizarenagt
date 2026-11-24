/*
 * MODEL — resultados de uma sala e relatório do professor.
 *
 * As funções daqui são puras (sem React e sem acesso a dados): recebem os
 * resultados registrados e as perguntas e devolvem os números prontos
 * para a tela. Isso facilita testar e trocar a origem dos dados depois.
 */
import { resolvePlayerAvatarId } from './avatars.ts';
import type { GameMode } from '../services/socket';
import type { OpponentPlayer } from './game';
import type { Question } from './question';
import type { Room } from './room';
import type {
    ApiGameDetailedResults,
    ApiGameHistoryItem,
    ApiGameStatus,
    ApiRoomAggregatedStats,
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
    /** Enunciados preservados do snapshot da partida (indexados por id da questão/snapshot). */
    questionStatements?: Record<string, string>;
    /** Participantes simulados da demonstração (fixos por sala). */
    simulatedPlayers: OpponentPlayer[];
    /** Alunos reais que concluíram a partida. */
    players: PlayerResult[];
}

export interface StudentReportRow {
    position: number;
    nickname: string;
    avatarId?: string;
    isSimulated: boolean;
    score: number;
    correctCount: number;
    /** Total de não-acertos (erros + não respondidas), preservado para compatibilidade. */
    wrongCount: number;
    /** Respostas efetivamente enviadas pelo participante. */
    answeredCount?: number;
    /** Respostas enviadas incorretamente. */
    incorrectCount?: number;
    /** Rodadas/questões sem resposta enviada (tempo esgotado ou saída). */
    unansweredCount?: number;
    /** Taxa de acerto sobre o total de questões da partida (0 a 1). */
    accuracyRate?: number;
    /** Indica se há outro participante empatado com a mesma pontuação. */
    isTied?: boolean;
}

export interface QuestionReportRow {
    questionId: string;
    statement: string;
    correctCount: number;
    answeredCount: number;
    /** Taxa de acerto entre respostas enviadas (0 a 1). */
    correctRate: number;
    /** Número da rodada no jogo, quando disponível. */
    roundNumber?: number;
    roundStatus?: 'OPEN' | 'CLOSED';
    /** Respostas incorretas efetivamente enviadas. */
    incorrectCount?: number;
    /** Participantes da partida que não responderam esta questão. */
    unansweredCount?: number;
    /** Total de participantes considerados na partida. */
    participantCount?: number;
    /** Taxa de acerto sobre todos os participantes (0 a 1). */
    overallCorrectRate?: number;
}

export interface RoomReport {
    participantCount: number;
    realStudentCount: number;
    questionCount: number;
    /** Média de acerto sobre respostas enviadas (totalCorrect / totalAnswered), de 0 a 1. */
    averageCorrectRate: number;
    /** Aproveitamento geral sobre todas as oportunidades (totalCorrect / expectedAnswers), de 0 a 1. */
    overallCorrectRate?: number;
    /** Taxa de participação nas respostas (totalAnswered / expectedAnswers), de 0 a 1. */
    responseRate?: number;
    expectedAnswers?: number;
    totalAnswered?: number;
    totalCorrect?: number;
    totalIncorrect?: number;
    totalUnanswered?: number;
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
            // Pela regra de pontuação do servidor, só acertos pontuam positivamente (mínimo de 100).
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
    const scoreCounts = new Map<number, number>();
    const rawRanking: StudentReportRow[] = participants
        .map((participant) => {
            const answeredCount = participant.answers.length;
            const correctCount = participant.answers.filter((answer) => answer.isCorrect).length;
            const incorrectCount = Math.max(0, answeredCount - correctCount);
            const unansweredCount = Math.max(0, results.questionIds.length - answeredCount);
            const score = participant.answers.reduce((sum, answer) => sum + answer.points, 0);
            scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);

            return {
                position: 0,
                nickname: participant.nickname,
                isSimulated: participant.isSimulated,
                score,
                correctCount,
                wrongCount: results.questionIds.length - correctCount,
                answeredCount,
                incorrectCount,
                unansweredCount,
                accuracyRate: results.questionIds.length > 0 ? correctCount / results.questionIds.length : 0,
            };
        })
        .sort((a, b) => b.score - a.score);

    const ranking: StudentReportRow[] = rawRanking.map((row, index) => ({
        ...row,
        position: index + 1,
        isTied: (scoreCounts.get(row.score) ?? 0) > 1,
    }));

    const studentsWithMostCorrect = [...ranking]
        .filter((row) => row.correctCount > 0)
        .sort((a, b) => b.correctCount - a.correctCount || b.score - a.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const studentsWithMostWrong = [...ranking]
        .filter((row) => (row.incorrectCount ?? 0) > 0)
        .sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0) || a.score - b.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    // ----- Perguntas -----
    const participantCount = participants.length;
    const questionRows: QuestionReportRow[] = results.questionIds.map((questionId, index) => {
        const answers = participants
            .map((participant) => participant.answers.find((answer) => answer.questionId === questionId))
            .filter((answer): answer is QuestionResult => answer !== undefined);
        const correctCount = answers.filter((answer) => answer.isCorrect).length;
        const answeredCount = answers.length;
        const incorrectCount = Math.max(0, answeredCount - correctCount);
        const unansweredCount = Math.max(0, participantCount - answeredCount);
        const snapshotStatement = results.questionStatements?.[questionId]?.trim();
        const bankStatement = questionBank
            .find((question) => question.id === questionId)
            ?.statement?.trim();

        return {
            questionId,
            statement:
                snapshotStatement ||
                bankStatement ||
                'Enunciado indisponível para esta partida',
            roundNumber: index + 1,
            correctCount,
            answeredCount,
            incorrectCount,
            unansweredCount,
            participantCount,
            correctRate: answeredCount > 0 ? correctCount / answeredCount : 0,
            overallCorrectRate: participantCount > 0 ? correctCount / participantCount : 0,
        };
    });

    const mostCorrectQuestions = [...questionRows]
        .filter((row) => row.correctCount > 0)
        .sort((a, b) => b.correctRate - a.correctRate || b.correctCount - a.correctCount)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const mostMissedQuestions = [...questionRows]
        .filter((row) => (row.incorrectCount ?? 0) > 0)
        .sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0) || a.correctRate - b.correctRate)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const totalAnswered = questionRows.reduce((sum, row) => sum + row.answeredCount, 0);
    const totalCorrect = questionRows.reduce((sum, row) => sum + row.correctCount, 0);
    const totalIncorrect = questionRows.reduce((sum, row) => sum + (row.incorrectCount ?? 0), 0);
    const expectedAnswers = participantCount * questionRows.length;
    const totalUnanswered = Math.max(0, expectedAnswers - totalAnswered);

    return {
        participantCount,
        realStudentCount: results.players.length,
        questionCount: results.questionIds.length,
        averageCorrectRate: totalAnswered > 0 ? totalCorrect / totalAnswered : 0,
        overallCorrectRate: expectedAnswers > 0 ? totalCorrect / expectedAnswers : 0,
        responseRate: expectedAnswers > 0 ? totalAnswered / expectedAnswers : 0,
        expectedAnswers,
        totalAnswered,
        totalCorrect,
        totalIncorrect,
        totalUnanswered,
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

export type GameHistoryStatusFilter = 'ALL' | ApiGameStatus;

/** Filtra a lista de partidas da sala pelo status selecionado. */
export function filterRoomGamesByStatus(
    games: ApiGameHistoryItem[],
    statusFilter: GameHistoryStatusFilter,
): ApiGameHistoryItem[] {
    if (statusFilter === 'ALL') {
        return games;
    }
    return games.filter((game) => game.status === statusFilter);
}

/** Rótulo curto para o modo de jogo no histórico e relatório. */
export function formatShortGameMode(mode: GameMode): string {
    return mode === 'HARDCORE' ? 'Hardcore' : 'Clássico';
}

export type QuestionDifficultyLevel = 'easy' | 'medium' | 'hard' | 'no-data';

/** Classifica a dificuldade real da questão a partir das respostas registradas. */
export function classifyQuestionDifficulty(
    row: Pick<QuestionReportRow, 'answeredCount' | 'overallCorrectRate' | 'correctRate' | 'participantCount'>,
): { level: QuestionDifficultyLevel; label: string } {
    if (row.answeredCount === 0) {
        return { level: 'no-data', label: 'Sem respostas' };
    }

    const baseRate =
        (row.participantCount ?? 0) > 0
            ? (row.overallCorrectRate ?? row.correctRate)
            : row.correctRate;

    if (baseRate >= 0.7) {
        return { level: 'easy', label: 'Fácil' };
    }

    if (baseRate >= 0.4) {
        return { level: 'medium', label: 'Moderada' };
    }

    return { level: 'hard', label: 'Difícil' };
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

    const participantCount = details.ranking.length;
    const totalQuestionsInMatch = Math.max(details.questionCount, details.questions.length);

    const scoreCounts = new Map<number, number>();
    for (const entry of details.ranking) {
        scoreCounts.set(entry.score, (scoreCounts.get(entry.score) ?? 0) + 1);
    }

    const ranking: StudentReportRow[] = details.ranking.map((entry) => {
        const answeredCount = Math.max(0, entry.answeredCount);
        const correctCount = Math.max(0, entry.correctCount);
        const incorrectCount = Math.max(0, answeredCount - correctCount);
        const expectedForPlayer = Math.max(
            totalQuestionsInMatch,
            correctCount + entry.wrongCount,
            answeredCount,
        );
        const unansweredCount = Math.max(0, expectedForPlayer - answeredCount);

        return {
            position: entry.position,
            nickname: entry.nickname,
            avatarId: resolvePlayerAvatarId(entry.avatarId),
            isSimulated: false,
            score: entry.score,
            correctCount,
            wrongCount: entry.wrongCount,
            answeredCount,
            incorrectCount,
            unansweredCount,
            accuracyRate: expectedForPlayer > 0 ? correctCount / expectedForPlayer : 0,
            isTied: (scoreCounts.get(entry.score) ?? 0) > 1,
        };
    });

    const studentsWithMostCorrect = [...ranking]
        .filter((row) => row.correctCount > 0)
        .sort((a, b) => b.correctCount - a.correctCount || b.score - a.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const studentsWithMostWrong = [...ranking]
        .filter((row) => (row.incorrectCount ?? 0) > 0)
        .sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0) || a.score - b.score)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const questionRows: QuestionReportRow[] = details.questions.map((q) => {
        const answeredCount = Math.max(0, q.answeredCount);
        const correctCount = Math.max(0, q.correctCount);
        const incorrectCount = Math.max(0, answeredCount - correctCount);
        const unansweredCount = Math.max(0, participantCount - answeredCount);

        return {
            questionId: q.questionId,
            statement: q.statement,
            roundNumber: q.roundNumber,
            roundStatus: q.roundStatus,
            correctCount,
            answeredCount,
            incorrectCount,
            unansweredCount,
            participantCount,
            correctRate: q.correctRate,
            overallCorrectRate: participantCount > 0 ? correctCount / participantCount : 0,
        };
    });

    const mostCorrectQuestions = [...questionRows]
        .filter((row) => row.correctCount > 0)
        .sort((a, b) => b.correctRate - a.correctRate || b.correctCount - a.correctCount)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const mostMissedQuestions = [...questionRows]
        .filter((row) => (row.incorrectCount ?? 0) > 0)
        .sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0) || a.correctRate - b.correctRate)
        .slice(0, REPORT_HIGHLIGHT_SIZE);

    const totalAnswered = questionRows.reduce((sum, row) => sum + row.answeredCount, 0);
    const totalCorrect = questionRows.reduce((sum, row) => sum + row.correctCount, 0);
    const totalIncorrect = questionRows.reduce((sum, row) => sum + (row.incorrectCount ?? 0), 0);
    const expectedAnswers = participantCount * questionRows.length;
    const totalUnanswered = Math.max(0, expectedAnswers - totalAnswered);

    return {
        participantCount,
        realStudentCount: participantCount,
        questionCount: details.questionCount,
        averageCorrectRate: totalAnswered > 0 ? totalCorrect / totalAnswered : 0,
        overallCorrectRate: expectedAnswers > 0 ? totalCorrect / expectedAnswers : 0,
        responseRate: expectedAnswers > 0 ? totalAnswered / expectedAnswers : 0,
        expectedAnswers,
        totalAnswered,
        totalCorrect,
        totalIncorrect,
        totalUnanswered,
        ranking,
        questionRows,
        mostCorrectQuestions,
        mostMissedQuestions,
        studentsWithMostCorrect,
        studentsWithMostWrong,
    };
}

export function buildEmptyRoomAggregatedStats(roomId: string): ApiRoomAggregatedStats {
    return {
        roomId,
        finishedGamesCount: 0,
        totalParticipations: 0,
        averagePlayersPerGame: null,
        averageScore: null,
        totalAnswers: 0,
        totalCorrectAnswers: 0,
        totalWrongAnswers: 0,
        averageCorrectRate: null,
        lastFinishedGameAt: null,
        hardestQuestions: [],
        easiestQuestions: [],
        questionPerformance: [],
    };
}

/**
 * Calcula métricas consolidadas a partir dos itens de histórico já carregados da sala
 * quando o backend ainda não enviou `stats` (ex.: mocks de testes unitários).
 * Contabiliza exclusivamente partidas `FINISHED`, sem contaminar com `CANCELLED` ou `IN_PROGRESS`.
 */
export function buildRoomAggregatedStatsFromHistory(
    roomId: string,
    games: readonly ApiGameHistoryItem[],
): ApiRoomAggregatedStats {
    const finishedGames = games.filter((game) => game.roomId === roomId && game.status === 'FINISHED');
    if (finishedGames.length === 0) {
        return buildEmptyRoomAggregatedStats(roomId);
    }

    let totalParticipations = 0;
    let totalScoreSum = 0;
    let totalAnswers = 0;
    let totalCorrectAnswers = 0;
    let lastFinishedGameAt: string | null = null;
    let lastFinishedTs = -1;

    for (const game of finishedGames) {
        totalParticipations += game.ranking.length;
        for (const entry of game.ranking) {
            totalScoreSum += entry.score;
            totalAnswers += Math.max(0, entry.answeredCount);
            totalCorrectAnswers += Math.max(0, entry.correctCount);
        }
        const refDate = game.finishedAt ?? game.startedAt ?? game.createdAt;
        const ts = Date.parse(refDate);
        if (!Number.isNaN(ts) && ts > lastFinishedTs) {
            lastFinishedTs = ts;
            lastFinishedGameAt = refDate;
        }
    }

    return {
        roomId,
        finishedGamesCount: finishedGames.length,
        totalParticipations,
        averagePlayersPerGame: totalParticipations / finishedGames.length,
        averageScore: totalParticipations > 0 ? totalScoreSum / totalParticipations : null,
        totalAnswers,
        totalCorrectAnswers,
        totalWrongAnswers: Math.max(0, totalAnswers - totalCorrectAnswers),
        averageCorrectRate: totalAnswers > 0 ? totalCorrectAnswers / totalAnswers : null,
        lastFinishedGameAt,
        hardestQuestions: [],
        easiestQuestions: [],
        questionPerformance: [],
    };
}

export function formatDecimalStat(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
        maximumFractionDigits: digits,
    });
}

export function computeGameHistoryAccuracyRate(
    game: Pick<ApiGameHistoryItem, 'averageCorrectRate' | 'answeredCount' | 'correctCount' | 'ranking'>,
): number | null {
    if (typeof game.averageCorrectRate === 'number' && !Number.isNaN(game.averageCorrectRate)) {
        return game.averageCorrectRate;
    }

    const totalAnswered =
        typeof game.answeredCount === 'number'
            ? game.answeredCount
            : game.ranking.reduce((sum, entry) => sum + Math.max(0, entry.answeredCount), 0);
    if (totalAnswered <= 0) {
        return null;
    }

    const totalCorrect =
        typeof game.correctCount === 'number'
            ? game.correctCount
            : game.ranking.reduce((sum, entry) => sum + Math.max(0, entry.correctCount), 0);

    return totalCorrect / totalAnswered;
}

export interface RoomOverviewDashboardEntry {
    room: Room;
    stats: ApiRoomAggregatedStats;
}

export interface ExecuteLoadOverviewAnalyticsParams {
    rooms: readonly Room[];
    requestSeqRef: { current: number };
    fetchRoomGamesWithStats: (
        roomId: string,
    ) => Promise<{ games: ApiGameHistoryItem[]; stats: ApiRoomAggregatedStats | null }>;
    cachedStatsByRoomId?: ReadonlyMap<string, ApiRoomAggregatedStats>;
    onLoadingChange?: (loading: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (entries: RoomOverviewDashboardEntry[]) => void;
}

/**
 * Carrega os dashboards analíticos consolidados exclusivamente para salas que já
 * possuem ao menos uma partida finalizada, preservando isolamento e evitando dados obsoletos.
 */
export async function executeLoadOverviewAnalytics({
    rooms,
    requestSeqRef,
    fetchRoomGamesWithStats,
    cachedStatsByRoomId,
    onLoadingChange,
    onError,
    onSuccess,
}: ExecuteLoadOverviewAnalyticsParams): Promise<RoomOverviewDashboardEntry[] | null> {
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;

    const playedRooms = rooms.filter((room) => (room.finishedGamesCount ?? 0) > 0);
    if (playedRooms.length === 0) {
        onSuccess([]);
        onError(null);
        onLoadingChange?.(false);
        return [];
    }

    onLoadingChange?.(true);
    onError(null);

    try {
        const loadedEntries = await Promise.all(
            playedRooms.map(async (room): Promise<RoomOverviewDashboardEntry | null> => {
                const cached = cachedStatsByRoomId?.get(room.id);
                if (
                    cached &&
                    cached.finishedGamesCount === room.finishedGamesCount &&
                    (cached.lastFinishedGameAt ?? null) === (room.lastGameFinishedAt ?? null)
                ) {
                    return cached.finishedGamesCount > 0 ? { room, stats: cached } : null;
                }

                const result = await fetchRoomGamesWithStats(room.id);
                const stats = result.stats ?? buildRoomAggregatedStatsFromHistory(room.id, result.games);
                return stats.finishedGamesCount > 0 ? { room, stats } : null;
            }),
        );

        if (requestSeqRef.current !== seq) {
            return null;
        }

        const validEntries = loadedEntries.filter(
            (entry): entry is RoomOverviewDashboardEntry => entry !== null,
        );
        onSuccess(validEntries);
        return validEntries;
    } catch (error) {
        if (requestSeqRef.current !== seq) {
            return null;
        }
        onError(
            error instanceof Error && error.message.trim()
                ? error.message.trim()
                : 'Não foi possível carregar os dashboards analíticos das salas.',
        );
        return null;
    } finally {
        if (requestSeqRef.current === seq) {
            onLoadingChange?.(false);
        }
    }
}

export interface ExecuteLoadRoomGamesParams {
    roomId: string | null;
    requestSeqRef: { current: number };
    fetchRoomGames?: (roomId: string) => Promise<ApiGameHistoryItem[]>;
    fetchRoomGamesWithStats?: (
        roomId: string,
    ) => Promise<{ games: ApiGameHistoryItem[]; stats: ApiRoomAggregatedStats | null }>;
    onLoadingChange?: (loading: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (games: ApiGameHistoryItem[]) => void;
    onStatsSuccess?: (stats: ApiRoomAggregatedStats | null) => void;
}

/**
 * Carrega o histórico persistido (e estatísticas agregadas, quando disponíveis) de uma sala
 * com proteção contra respostas fora de ordem.
 */
export async function executeLoadRoomGames({
    roomId,
    requestSeqRef,
    fetchRoomGames,
    fetchRoomGamesWithStats,
    onLoadingChange,
    onError,
    onSuccess,
    onStatsSuccess,
}: ExecuteLoadRoomGamesParams): Promise<ApiGameHistoryItem[] | null> {
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;

    if (!roomId) {
        onSuccess([]);
        onStatsSuccess?.(null);
        onError(null);
        onLoadingChange?.(false);
        return null;
    }

    onLoadingChange?.(true);
    onError(null);

    try {
        let games: ApiGameHistoryItem[];
        let stats: ApiRoomAggregatedStats | null = null;

        if (fetchRoomGamesWithStats) {
            const result = await fetchRoomGamesWithStats(roomId);
            games = result.games;
            stats = result.stats ?? buildRoomAggregatedStatsFromHistory(roomId, games);
        } else if (fetchRoomGames) {
            games = await fetchRoomGames(roomId);
            stats = buildRoomAggregatedStatsFromHistory(roomId, games);
        } else {
            games = [];
        }

        if (requestSeqRef.current !== seq) {
            return null;
        }
        onSuccess(games);
        onStatsSuccess?.(stats);
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
