/*
 * MODEL — resultados de uma sala e relatório do professor.
 *
 * As funções daqui são puras (sem React e sem acesso a dados): recebem os
 * resultados registrados e as perguntas e devolvem os números prontos
 * para a tela. Isso facilita testar e trocar a origem dos dados depois.
 */
import type { OpponentPlayer } from './game';
import type { Question } from './question';

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
