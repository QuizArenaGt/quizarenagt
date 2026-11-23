import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRoomReportFromServerGame,
    classifyQuestionDifficulty,
    filterRoomGamesByStatus,
    formatShortGameMode,
} from '../src/models/roomReport.ts';
import type {
    ApiGameDetailedResults,
    ApiGameHistoryItem,
} from '../src/services/roomStorageService.ts';

describe('Partidas e Relatórios (Auditoria de Métricas e UX)', () => {
    it('1. partida com 1 pergunta, 1 acerto e 1 sem resposta separa acertos, erros reais e não respondidas sem falsos "erros"', () => {
        const oneQuestionPartialParticipation: ApiGameDetailedResults = {
            id: 'game-audit-1',
            roomId: 'room-1',
            status: 'FINISHED',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-23T01:00:00.000Z',
            finishedAt: '2026-11-23T01:00:40.000Z',
            createdAt: '2026-11-23T00:59:00.000Z',
            durationMs: 40_000,
            playerCount: 2,
            winner: { id: 'p1', nickname: 'Ana', score: 820 },
            ranking: [
                {
                    id: 'p1',
                    nickname: 'Ana',
                    score: 820,
                    position: 1,
                    correctCount: 1,
                    wrongCount: 0,
                    answeredCount: 1,
                    joinedAt: '2026-11-23T00:59:10.000Z',
                },
                {
                    id: 'p2',
                    nickname: 'Bruno',
                    score: 0,
                    position: 2,
                    correctCount: 0,
                    // Backend soma "não respondidas" em wrongCount (totalRounds - correctCount = 1)
                    wrongCount: 1,
                    answeredCount: 0,
                    joinedAt: '2026-11-23T00:59:20.000Z',
                },
            ],
            questionCount: 1,
            questions: [
                {
                    questionId: 'q-1',
                    statement: 'Qual protocolo opera na camada de transporte?',
                    position: 0,
                    roundNumber: 1,
                    roundStatus: 'CLOSED',
                    answeredCount: 1,
                    correctCount: 1,
                    correctRate: 1,
                },
            ],
        };

        const report = buildRoomReportFromServerGame(oneQuestionPartialParticipation);
        assert.ok(report);

        assert.equal(report.expectedAnswers, 2);
        assert.equal(report.totalAnswered, 1);
        assert.equal(report.totalCorrect, 1);
        assert.equal(report.totalIncorrect, 0);
        assert.equal(report.totalUnanswered, 1);
        assert.equal(report.overallCorrectRate, 0.5);
        assert.equal(report.averageCorrectRate, 1);
        assert.equal(report.responseRate, 0.5);

        // Ninguém enviou resposta errada: "Questões com mais erros" e "Mais erros enviados" devem estar vazios
        assert.deepEqual(report.mostMissedQuestions, []);
        assert.deepEqual(report.studentsWithMostWrong, []);

        assert.equal(report.ranking[1]?.incorrectCount, 0);
        assert.equal(report.ranking[1]?.unansweredCount, 1);

        assert.equal(report.questionRows[0]?.incorrectCount, 0);
        assert.equal(report.questionRows[0]?.unansweredCount, 1);
        assert.equal(report.questionRows[0]?.overallCorrectRate, 0.5);
    });

    it('2. identifica empates, pontuações negativas do modo Hardcore e ordena erros reais corretamente', () => {
        const hardcoreWithTieAndWrong: ApiGameDetailedResults = {
            id: 'game-hc-1',
            roomId: 'room-hc',
            status: 'FINISHED',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'HARDCORE',
            startedAt: '2026-11-23T02:00:00.000Z',
            finishedAt: '2026-11-23T02:02:00.000Z',
            createdAt: '2026-11-23T01:58:00.000Z',
            durationMs: 120_000,
            playerCount: 3,
            winner: { id: 'p1', nickname: 'Carla', score: 650 },
            ranking: [
                {
                    id: 'p1',
                    nickname: 'Carla',
                    score: 650,
                    position: 1,
                    correctCount: 1,
                    wrongCount: 1,
                    answeredCount: 2,
                    joinedAt: '2026-11-23T01:58:10.000Z',
                },
                {
                    id: 'p2',
                    nickname: 'Diego',
                    score: 650,
                    position: 2,
                    correctCount: 1,
                    wrongCount: 1,
                    answeredCount: 2,
                    joinedAt: '2026-11-23T01:58:20.000Z',
                },
                {
                    id: 'p3',
                    nickname: 'Elena',
                    score: -60,
                    position: 3,
                    correctCount: 0,
                    wrongCount: 2,
                    answeredCount: 2,
                    joinedAt: '2026-11-23T01:58:30.000Z',
                },
            ],
            questionCount: 2,
            questions: [
                {
                    questionId: 'q-1',
                    statement: 'Questão 1',
                    position: 0,
                    roundNumber: 1,
                    roundStatus: 'CLOSED',
                    answeredCount: 3,
                    correctCount: 2,
                    correctRate: 2 / 3,
                },
                {
                    questionId: 'q-2',
                    statement: 'Questão 2',
                    position: 1,
                    roundNumber: 2,
                    roundStatus: 'CLOSED',
                    answeredCount: 3,
                    correctCount: 0,
                    correctRate: 0,
                },
            ],
        };

        const report = buildRoomReportFromServerGame(hardcoreWithTieAndWrong);
        assert.ok(report);

        assert.equal(report.ranking[0]?.isTied, true);
        assert.equal(report.ranking[1]?.isTied, true);
        assert.equal(report.ranking[2]?.isTied, false);
        assert.equal(report.ranking[2]?.score, -60);

        assert.equal(report.mostMissedQuestions.length, 2);
        assert.equal(report.mostMissedQuestions[0]?.questionId, 'q-2');
        assert.equal(report.mostMissedQuestions[0]?.incorrectCount, 3);
        assert.equal(report.studentsWithMostWrong[0]?.nickname, 'Elena');
        assert.equal(report.studentsWithMostWrong[0]?.incorrectCount, 2);
    });

    it('3. filtra histórico por status, formata modo curto e classifica dificuldade das questões', () => {
        const games: ApiGameHistoryItem[] = [
            {
                id: 'g1',
                roomId: 'r1',
                status: 'FINISHED',
                maxPlayers: 10,
                questionTime: 30,
                gameMode: 'CLASSIC',
                startedAt: null,
                finishedAt: null,
                createdAt: '2026-11-23T01:00:00.000Z',
                durationMs: 60_000,
                playerCount: 2,
                winner: null,
                ranking: [],
            },
            {
                id: 'g2',
                roomId: 'r1',
                status: 'CANCELLED',
                maxPlayers: 10,
                questionTime: 30,
                gameMode: 'HARDCORE',
                startedAt: null,
                finishedAt: null,
                createdAt: '2026-11-23T02:00:00.000Z',
                durationMs: null,
                playerCount: 1,
                winner: null,
                ranking: [],
            },
        ];

        assert.equal(filterRoomGamesByStatus(games, 'ALL').length, 2);
        assert.deepEqual(
            filterRoomGamesByStatus(games, 'CANCELLED').map((g) => g.id),
            ['g2'],
        );
        assert.equal(formatShortGameMode('CLASSIC'), 'Clássico');
        assert.equal(formatShortGameMode('HARDCORE'), 'Hardcore');

        assert.equal(
            classifyQuestionDifficulty({
                answeredCount: 0,
                correctRate: 0,
                overallCorrectRate: 0,
                participantCount: 2,
            }).level,
            'no-data',
        );
        assert.equal(
            classifyQuestionDifficulty({
                answeredCount: 2,
                correctRate: 1,
                overallCorrectRate: 0.5,
                participantCount: 2,
            }).level,
            'medium',
        );
        assert.equal(
            classifyQuestionDifficulty({
                answeredCount: 2,
                correctRate: 0.5,
                overallCorrectRate: 0.25,
                participantCount: 4,
            }).level,
            'hard',
        );
    });

    it('4. histórico e modal de relatório usam design system adaptativo sem colunas comprimidas', () => {
        const dashboardSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/features/Dashboard/components/DashboardForm.tsx'),
            'utf8',
        );
        assert.match(dashboardSrc, /game-history__list/);
        assert.match(dashboardSrc, /filterRoomGamesByStatus/);
        assert.doesNotMatch(dashboardSrc, /<table className="questions-table">/);

        const reportModalSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Dashboard/RoomReportModal/RoomReportModal.tsx'),
            'utf8',
        );
        assert.match(reportModalSrc, /report-kpi-strip/);
        assert.match(reportModalSrc, /report-ranking-cards/);
        assert.match(reportModalSrc, /QuestionAnalysisItem/);
        assert.doesNotMatch(reportModalSrc, /#f8fafc|#64748b/);
    });
});
