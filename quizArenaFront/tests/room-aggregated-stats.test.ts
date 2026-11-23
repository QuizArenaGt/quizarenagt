import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRoomAggregatedStatsFromHistory,
    computeGameHistoryAccuracyRate,
    executeLoadOverviewAnalytics,
    executeLoadRoomGames,
    formatDecimalStat,
    type RoomOverviewDashboardEntry,
} from '../src/models/roomReport.ts';
import type { Room } from '../src/models/room.ts';
import {
    listRoomGamesWithStatsApi,
    type ApiGameHistoryItem,
    type ApiRoomAggregatedStats,
} from '../src/services/roomStorageService.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Visão Geral Analítica por Sala & Histórico Persistente', () => {
    const sampleRooms: Room[] = [
        {
            id: 'room-A',
            code: 'AAAA11',
            name: 'Sala Alpha',
            theme: 'História',
            timeLimit: 30,
            maxPlayers: 10,
            gameMode: 'CLASSIC',
            status: 'Finalizado',
            backendStatus: 'FINISHED',
            questionIds: [],
            players: [],
            finishedGamesCount: 5,
            lastGameFinishedAt: '2026-11-21T15:00:00.000Z',
        },
        {
            id: 'room-B',
            code: 'BBBB22',
            name: 'Sala Beta',
            theme: 'Ciências',
            timeLimit: 30,
            maxPlayers: 10,
            gameMode: 'HARDCORE',
            status: 'Aguardando',
            backendStatus: 'WAITING',
            questionIds: [],
            players: [],
            finishedGamesCount: 2,
            lastGameFinishedAt: '2026-11-21T16:00:00.000Z',
        },
        {
            id: 'room-C',
            code: 'CCCC33',
            name: 'Sala Sem Partidas Finalizadas',
            theme: 'Matemática',
            timeLimit: 30,
            maxPlayers: 10,
            gameMode: 'CLASSIC',
            status: 'Aguardando',
            backendStatus: 'WAITING',
            questionIds: [],
            players: [],
            finishedGamesCount: 0,
            lastGameFinishedAt: null,
        },
    ];

    const sampleGames: ApiGameHistoryItem[] = [
        {
            id: 'g-fin-2',
            roomId: 'room-A',
            status: 'FINISHED',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'HARDCORE',
            startedAt: '2026-11-21T14:00:00.000Z',
            finishedAt: '2026-11-21T14:05:00.000Z',
            createdAt: '2026-11-21T13:58:00.000Z',
            durationMs: 300_000,
            playerCount: 2,
            answeredCount: 4,
            correctCount: 2,
            averageCorrectRate: 0.5,
            winner: { id: 'p1', nickname: 'Alice', score: 120 },
            ranking: [
                {
                    id: 'p1',
                    nickname: 'Alice',
                    score: 120,
                    position: 1,
                    correctCount: 2,
                    wrongCount: 0,
                    answeredCount: 2,
                    joinedAt: '2026-11-21T13:59:00.000Z',
                },
                {
                    id: 'p2',
                    nickname: 'Bruno',
                    score: -60,
                    position: 2,
                    correctCount: 0,
                    wrongCount: 2,
                    answeredCount: 2,
                    joinedAt: '2026-11-21T13:59:10.000Z',
                },
            ],
        },
        {
            id: 'g-cancelled',
            roomId: 'room-A',
            status: 'CANCELLED',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-21T12:00:00.000Z',
            finishedAt: '2026-11-21T12:01:00.000Z',
            createdAt: '2026-11-21T11:58:00.000Z',
            durationMs: 60_000,
            playerCount: 1,
            winner: null,
            ranking: [
                {
                    id: 'pc1',
                    nickname: 'Saiu',
                    score: 999,
                    position: 1,
                    correctCount: 1,
                    wrongCount: 0,
                    answeredCount: 1,
                    joinedAt: '2026-11-21T11:59:00.000Z',
                },
            ],
        },
        {
            id: 'g-other-room',
            roomId: 'room-B',
            status: 'FINISHED',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-21T15:00:00.000Z',
            finishedAt: '2026-11-21T15:05:00.000Z',
            createdAt: '2026-11-21T14:58:00.000Z',
            durationMs: 300_000,
            playerCount: 3,
            winner: { id: 'pb1', nickname: 'Davi', score: 300 },
            ranking: [
                {
                    id: 'pb1',
                    nickname: 'Davi',
                    score: 300,
                    position: 1,
                    correctCount: 3,
                    wrongCount: 0,
                    answeredCount: 3,
                    joinedAt: '2026-11-21T14:59:00.000Z',
                },
            ],
        },
    ];

    it('1. filtra estritamente por sala, exclui CANCELLED/IN_PROGRESS e preserva pontuações negativas Hardcore', () => {
        const statsA = buildRoomAggregatedStatsFromHistory('room-A', sampleGames);
        const statsEmpty = buildRoomAggregatedStatsFromHistory('room-C', sampleGames);

        assert.equal(statsA.finishedGamesCount, 1);
        assert.equal(statsA.totalParticipations, 2);
        assert.equal(statsA.averagePlayersPerGame, 2);
        assert.equal(statsA.averageScore, 30);
        assert.equal(statsA.totalAnswers, 4);
        assert.equal(statsA.totalCorrectAnswers, 2);
        assert.equal(statsA.totalWrongAnswers, 2);
        assert.equal(statsA.averageCorrectRate, 0.5);

        assert.equal(statsEmpty.finishedGamesCount, 0);
        assert.equal(statsEmpty.totalParticipations, 0);
        assert.equal(statsEmpty.averagePlayersPerGame, null);
        assert.equal(statsEmpty.averageScore, null);
        assert.equal(statsEmpty.averageCorrectRate, null);
    });

    it('2. executeLoadOverviewAnalytics exibe somente salas com partidas finalizadas, isola cada sala e ignora Sala C', async () => {
        const requestedRoomIds: string[] = [];
        const seqRef = { current: 0 };
        let capturedEntries: RoomOverviewDashboardEntry[] = [];

        const statsByRoom: Record<string, ApiRoomAggregatedStats> = {
            'room-A': {
                roomId: 'room-A',
                finishedGamesCount: 5,
                totalParticipations: 12,
                averagePlayersPerGame: 2.4,
                averageScore: 150,
                totalAnswers: 20,
                totalCorrectAnswers: 15,
                totalWrongAnswers: 5,
                averageCorrectRate: 0.75,
                lastFinishedGameAt: '2026-11-21T15:00:00.000Z',
                hardestQuestions: [],
                easiestQuestions: [],
                questionPerformance: [],
            },
            'room-B': {
                roomId: 'room-B',
                finishedGamesCount: 2,
                totalParticipations: 4,
                averagePlayersPerGame: 2,
                averageScore: 60,
                totalAnswers: 8,
                totalCorrectAnswers: 2,
                totalWrongAnswers: 6,
                averageCorrectRate: 0.25,
                lastFinishedGameAt: '2026-11-21T16:00:00.000Z',
                hardestQuestions: [],
                easiestQuestions: [],
                questionPerformance: [],
            },
        };

        await executeLoadOverviewAnalytics({
            rooms: sampleRooms,
            requestSeqRef: seqRef,
            fetchRoomGamesWithStats: async (roomId) => {
                requestedRoomIds.push(roomId);
                return {
                    games: [],
                    stats: statsByRoom[roomId] ?? null,
                };
            },
            onError: () => undefined,
            onSuccess: (entries) => {
                capturedEntries = entries;
            },
        });

        assert.deepEqual(requestedRoomIds, ['room-A', 'room-B']);
        assert.equal(capturedEntries.length, 2);
        assert.equal(capturedEntries[0]?.room.id, 'room-A');
        assert.equal(capturedEntries[0]?.stats.finishedGamesCount, 5);
        assert.equal(capturedEntries[1]?.room.id, 'room-B');
        assert.equal(capturedEntries[1]?.stats.finishedGamesCount, 2);
        assert.equal(
            capturedEntries.some((entry) => entry.room.id === 'room-C'),
            false,
        );
    });

    it('3. listRoomGamesWithStatsApi e executeLoadRoomGames carregam histórico e stats em chamada única sem mistura entre salas', async () => {
        const serverStats: ApiRoomAggregatedStats = {
            roomId: 'room-A',
            finishedGamesCount: 2,
            totalParticipations: 5,
            averagePlayersPerGame: 2.5,
            averageScore: 110,
            totalAnswers: 10,
            totalCorrectAnswers: 7,
            totalWrongAnswers: 3,
            averageCorrectRate: 0.7,
            lastFinishedGameAt: '2026-11-21T14:05:00.000Z',
            hardestQuestions: [],
            easiestQuestions: [],
            questionPerformance: [],
        };

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(
                JSON.stringify({
                    games: sampleGames.filter((g) => g.roomId === 'room-A'),
                    stats: serverStats,
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            )) as typeof fetch;

        try {
            const seqRef = { current: 0 };
            let loadedGames: ApiGameHistoryItem[] = [];
            let loadedStats: ApiRoomAggregatedStats | null = null;

            await executeLoadRoomGames({
                roomId: 'room-A',
                requestSeqRef: seqRef,
                fetchRoomGamesWithStats: listRoomGamesWithStatsApi,
                onError: () => undefined,
                onSuccess: (games) => {
                    loadedGames = games;
                },
                onStatsSuccess: (stats) => {
                    loadedStats = stats;
                },
            });

            assert.equal(loadedGames.length, 2);
            assert.equal((loadedStats as ApiRoomAggregatedStats | null)?.finishedGamesCount, 2);
            assert.equal((loadedStats as ApiRoomAggregatedStats | null)?.totalWrongAnswers, 3);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('4. formata decimais e taxa de acerto individual da partida com tratamento para zero respostas', () => {
        assert.equal(formatDecimalStat(null), '—');
        assert.equal(formatDecimalStat(2), '2');
        assert.equal(formatDecimalStat(2.5), '2,5');
        assert.equal(computeGameHistoryAccuracyRate(sampleGames[0]), 0.5);
        assert.equal(
            computeGameHistoryAccuracyRate({
                averageCorrectRate: null,
                answeredCount: 0,
                correctCount: 0,
                ranking: [],
            }),
            null,
        );
    });

    it('5. Visão Geral funciona como dashboard analítico por sala sem Central de Salas nem duplicação na sala', () => {
        const dashboardSrc = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');
        const overviewStatsSrc = readFrontFile('src/views/Dashboard/OverviewStats/OverviewStats.tsx');

        // Visão Geral global usa OverviewStats analítico por sala e não inclui Central de Salas nem botões de gerenciamento
        assert.match(overviewStatsSrc, /Nenhuma partida finalizada ainda/);
        assert.match(overviewStatsSrc, /Partidas finalizadas/);
        assert.match(overviewStatsSrc, /Respostas registradas/);
        assert.match(overviewStatsSrc, /Total de acertos/);
        assert.match(overviewStatsSrc, /Total de erros/);
        assert.match(overviewStatsSrc, /Taxa geral de acerto/);
        assert.match(overviewStatsSrc, /Participações acumuladas/);
        assert.match(overviewStatsSrc, /não são jogadores únicos/);
        assert.match(overviewStatsSrc, /Questões com maior índice de erros/);
        assert.match(overviewStatsSrc, /Questões com melhor desempenho/);
        assert.match(overviewStatsSrc, /Distribuição de acertos e erros/);
        assert.match(overviewStatsSrc, /Desempenho geral por questão/);
        assert.doesNotMatch(overviewStatsSrc, /Gerenciar sala/);
        assert.doesNotMatch(overviewStatsSrc, /Central de Salas/);

        // Partidas da sala: ignora lobbies WAITING não iniciados, exibe média de acerto e mantém relatório individual
        assert.match(
            dashboardSrc,
            /recordedRoomGames\s*=\s*roomsVm\.roomGames\.filter\(\(item\)\s*=>\s*item\.status\s*!==\s*'WAITING'\)/,
        );
        assert.match(dashboardSrc, /next\.set\('aba',\s*'visao-geral'\)/);
        assert.match(dashboardSrc, /computeGameHistoryAccuracyRate\(game\)/);
        assert.match(dashboardSrc, /Acerto médio:/);
        assert.match(dashboardSrc, /<RoomReportModal view=\{roomsVm\.reportView\}/);
    });
});
