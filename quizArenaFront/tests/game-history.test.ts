import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRoomReportFromServerGame,
    executeLoadRoomGames,
    executeOpenGameResults,
    formatGameDuration,
    formatGameStatusLabel,
    type RoomReport,
} from '../src/models/roomReport.ts';
import type { Room } from '../src/models/room.ts';
import { clearAllRoomResults } from '../src/services/roomResultsService.ts';
import {
    getGameResultsApi,
    listRoomGamesApi,
    type ApiGameDetailedResults,
    type ApiGameHistoryItem,
} from '../src/services/roomStorageService.ts';

describe('Etapa 3.2 — Histórico Persistente de Partidas no Frontend', () => {
    const sampleRoom: Room = {
        id: 'room-hist-1',
        code: 'HST123',
        name: 'Sala História',
        theme: 'História',
        timeLimit: 30,
        maxPlayers: 10,
        gameMode: 'CLASSIC',
        status: 'Aguardando',
        backendStatus: 'WAITING',
        currentGameId: 'game-2',
        questionIds: [],
        players: [],
    };

    const game1Finished: ApiGameHistoryItem = {
        id: 'game-1',
        roomId: 'room-hist-1',
        status: 'FINISHED',
        maxPlayers: 10,
        questionTime: 30,
        gameMode: 'CLASSIC',
        startedAt: '2026-11-18T12:00:00.000Z',
        finishedAt: '2026-11-18T12:02:15.000Z',
        createdAt: '2026-11-18T11:58:00.000Z',
        durationMs: 135_000,
        playerCount: 2,
        winner: { id: 'gp-1', nickname: 'Alice', score: 255 },
        ranking: [
            {
                id: 'gp-1',
                nickname: 'Alice',
                score: 255,
                position: 1,
                correctCount: 2,
                wrongCount: 0,
                answeredCount: 2,
                joinedAt: '2026-11-18T11:59:00.000Z',
            },
            {
                id: 'gp-2',
                nickname: 'Bob',
                score: 105,
                position: 2,
                correctCount: 1,
                wrongCount: 1,
                answeredCount: 2,
                joinedAt: '2026-11-18T11:59:10.000Z',
            },
        ],
    };

    const game2InProgress: ApiGameHistoryItem = {
        id: 'game-2',
        roomId: 'room-hist-1',
        status: 'IN_PROGRESS',
        maxPlayers: 15,
        questionTime: 45,
        gameMode: 'HARDCORE',
        startedAt: '2026-11-18T13:00:00.000Z',
        finishedAt: null,
        createdAt: '2026-11-18T12:55:00.000Z',
        durationMs: null,
        playerCount: 1,
        winner: null,
        ranking: [
            {
                id: 'gp-3',
                nickname: 'Carlos',
                score: -30,
                position: 1,
                correctCount: 0,
                wrongCount: 1,
                answeredCount: 1,
                joinedAt: '2026-11-18T12:56:00.000Z',
            },
        ],
    };

    const game1Details: ApiGameDetailedResults = {
        ...game1Finished,
        questionCount: 2,
        questions: [
            {
                questionId: 'sq-1',
                statement: 'Capital do Brasil?',
                position: 0,
                roundNumber: 1,
                roundStatus: 'CLOSED',
                answeredCount: 2,
                correctCount: 2,
                correctRate: 1,
            },
            {
                questionId: 'sq-2',
                statement: 'Maior oceano?',
                position: 1,
                roundNumber: 2,
                roundStatus: 'CLOSED',
                answeredCount: 2,
                correctCount: 1,
                correctRate: 0.5,
            },
        ],
    };

    const game2Details: ApiGameDetailedResults = {
        ...game2InProgress,
        questionCount: 1,
        questions: [
            {
                questionId: 'sq-3',
                statement: 'Pergunta da Partida 2',
                position: 0,
                roundNumber: 1,
                roundStatus: 'CLOSED',
                answeredCount: 1,
                correctCount: 0,
                correctRate: 0,
            },
        ],
    };

    it('1. deve diferenciar status e duração e estruturar histórico e modal na UI', () => {
        assert.equal(formatGameStatusLabel('FINISHED'), 'Finalizada');
        assert.equal(formatGameStatusLabel('CANCELLED'), 'Cancelada');
        assert.equal(formatGameStatusLabel('IN_PROGRESS'), 'Em andamento');
        assert.equal(formatGameStatusLabel('WAITING'), 'Aguardando');

        assert.equal(formatGameDuration(135_000, 'FINISHED'), '2m 15s');
        assert.equal(formatGameDuration(45_000, 'FINISHED'), '45s');
        assert.equal(formatGameDuration(3_720_000, 'FINISHED'), '1h 02m');
        assert.equal(formatGameDuration(null, 'IN_PROGRESS'), 'Em aberto');
        assert.equal(formatGameDuration(null, 'CANCELLED'), 'Não registrada');

        const dashboardSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/features/Dashboard/components/DashboardForm.tsx'),
            'utf8',
        );
        assert.match(dashboardSrc, /Histórico de Partidas/);
        assert.match(dashboardSrc, /formatGameStatusLabel\(game\.status\)/);
        assert.match(dashboardSrc, /openGameReport\(\s*activeRoom,\s*game\.id/);

        const reportModalSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Dashboard/RoomReportModal/RoomReportModal.tsx'),
            'utf8',
        );
        assert.match(reportModalSrc, /GameMetadataBanner/);
    });

    it('2. executeLoadRoomGames deve tratar estado vazio, erro e descartar respostas atrasadas de outra sala', async () => {
        const seqRef = { current: 0 };
        let gamesState: ApiGameHistoryItem[] = [game1Finished];
        let capturedError: string | null = 'erro-previo';

        await executeLoadRoomGames({
            roomId: 'room-empty',
            requestSeqRef: seqRef,
            fetchRoomGames: async () => [],
            onError: (err) => {
                capturedError = err;
            },
            onSuccess: (games) => {
                gamesState = games;
            },
        });

        assert.equal(capturedError, null);
        assert.deepEqual(gamesState, []);

        // Simula resposta atrasada da Sala A quando usuário já mudou para Sala B
        let resolveSlow!: (value: ApiGameHistoryItem[]) => void;
        const slowPromise = executeLoadRoomGames({
            roomId: 'room-A',
            requestSeqRef: seqRef,
            fetchRoomGames: () =>
                new Promise((resolve) => {
                    resolveSlow = resolve;
                }),
            onError: (err) => {
                capturedError = err;
            },
            onSuccess: (games) => {
                gamesState = games;
            },
        });

        await executeLoadRoomGames({
            roomId: 'room-B',
            requestSeqRef: seqRef,
            fetchRoomGames: async () => [game2InProgress],
            onError: (err) => {
                capturedError = err;
            },
            onSuccess: (games) => {
                gamesState = games;
            },
        });

        resolveSlow([game1Finished]);
        await slowPromise;

        const finalGames = gamesState as ApiGameHistoryItem[];
        assert.equal(finalGames.length, 1);
        assert.equal(finalGames[0].id, 'game-2');
    });

    it('3 e 4. após atualização de página (cache em memória limpo), listRoomGamesApi e getGameResultsApi recuperam histórico e ranking persistidos', async () => {
        clearAllRoomResults();

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/rooms/room-hist-1/games')) {
                return new Response(
                    JSON.stringify({ games: [game2InProgress, game1Finished] }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }
            if (url.endsWith('/rooms/room-hist-1/games/game-1/results')) {
                return new Response(JSON.stringify({ game: game1Details }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        }) as typeof fetch;

        try {
            const games = await listRoomGamesApi('room-hist-1');
            assert.equal(games.length, 2);
            assert.equal(games[0].id, 'game-2');
            assert.equal(games[1].id, 'game-1');
            assert.equal(games[1].winner?.nickname, 'Alice');

            const seqRef = { current: 0 };
            type ModalViewState = {
                room: Room;
                report: RoomReport | null;
                gameDetails?: ApiGameDetailedResults | null;
            };
            let modalView: ModalViewState | null = null;

            await executeOpenGameResults({
                room: sampleRoom,
                gameId: 'game-1',
                requestSeqRef: seqRef,
                fetchGameResults: getGameResultsApi,
                onStateChange: (view) => {
                    modalView = view;
                },
            });

            const resolvedView = modalView as ModalViewState | null;
            assert.ok(resolvedView);
            assert.equal(resolvedView.gameDetails?.id, 'game-1');
            assert.equal(resolvedView.report?.participantCount, 2);
            assert.equal(resolvedView.report?.ranking[0].nickname, 'Alice');
            assert.equal(resolvedView.report?.ranking[0].score, 255);
            assert.equal(resolvedView.report?.questionRows[0].statement, 'Capital do Brasil?');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('5. não mistura dados, jogadores ou pontuações entre partidas diferentes', async () => {
        const report1 = buildRoomReportFromServerGame(game1Details);
        const report2 = buildRoomReportFromServerGame(game2Details);

        assert.notEqual(report1, null);
        assert.notEqual(report2, null);

        assert.deepEqual(
            report1!.ranking.map((r) => [r.nickname, r.score]),
            [
                ['Alice', 255],
                ['Bob', 105],
            ],
        );
        assert.deepEqual(
            report2!.ranking.map((r) => [r.nickname, r.score]),
            [['Carlos', -30]],
        );

        assert.equal(report1!.questionRows[0].statement, 'Capital do Brasil?');
        assert.equal(report2!.questionRows[0].statement, 'Pergunta da Partida 2');
    });
});
