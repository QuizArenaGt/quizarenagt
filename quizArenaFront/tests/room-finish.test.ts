import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    executeFinishMatch,
    formatFinishMatchError,
    type Room,
} from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import {
    finishRoomApi,
    mapApiRoomToModel,
    type ApiHostRoom,
    type FinishRoomApiResponse,
} from '../src/services/roomStorageService.ts';

describe('Encerramento Antecipado de Partida (Frontend)', () => {
    const inProgressRoom: Room = {
        id: 'room-fin-1',
        code: 'FIN123',
        name: 'Sala Em Jogo',
        theme: 'Sistemas',
        timeLimit: 30,
        maxPlayers: 10,
        gameMode: 'CLASSIC',
        status: 'Em Andamento',
        backendStatus: 'IN_PROGRESS',
        currentGameId: 'game-fin-1',
        questionIds: [],
        players: [
            {
                id: 'gp-1',
                nickname: 'Alice',
                score: 140,
                joinedAt: '2026-11-20T15:00:00.000Z',
            },
            {
                id: 'gp-2',
                nickname: 'Bob',
                score: 0,
                joinedAt: '2026-11-20T15:00:05.000Z',
            },
        ],
    };

    const apiFinishedRoom: ApiHostRoom = {
        id: inProgressRoom.id,
        code: inProgressRoom.code,
        name: inProgressRoom.name,
        theme: inProgressRoom.theme,
        hostId: 'host-1',
        maxPlayers: 10,
        questionTime: 30,
        gameMode: 'CLASSIC',
        status: 'FINISHED',
        roomStatus: 'ACTIVE',
        archivedAt: null,
        createdAt: '2026-11-20T14:55:00.000Z',
        updatedAt: '2026-11-20T15:10:00.000Z',
        players: inProgressRoom.players,
        currentGame: {
            id: 'game-fin-1',
            status: 'FINISHED',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-20T15:00:00.000Z',
            finishedAt: '2026-11-20T15:10:00.000Z',
            createdAt: '2026-11-20T14:55:00.000Z',
            playerCount: 2,
            players: inProgressRoom.players,
        },
    };

    it('1. finishRoomApi chama POST /rooms/:id/finish e retorna sala FINISHED com ranking', async () => {
        const originalFetch = globalThis.fetch;
        let calledUrl = '';
        let calledMethod = '';

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calledUrl = String(input);
            calledMethod = init?.method ?? 'GET';
            return new Response(
                JSON.stringify({
                    message: 'Partida encerrada com sucesso.',
                    room: apiFinishedRoom,
                    ranking: [
                        { id: 'gp-1', nickname: 'Alice', score: 140, position: 1 },
                        { id: 'gp-2', nickname: 'Bob', score: 0, position: 2 },
                    ],
                    alreadyFinished: false,
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }) as typeof fetch;

        try {
            const response = await finishRoomApi(inProgressRoom.id);
            assert.match(calledUrl, /\/rooms\/room-fin-1\/finish$/);
            assert.equal(calledMethod, 'POST');
            assert.equal(response.room.status, 'FINISHED');
            assert.equal(response.ranking?.length, 2);
            assert.equal(response.ranking?.[0]?.score, 140);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('2. executeFinishMatch evita múltiplos envios em andamento e atualiza sala para Finalizado preservando pontuações', async () => {
        let currentRoom: Room = inProgressRoom;
        let calls = 0;
        let lastError: string | null = 'erro-antigo';
        const loadingStates: boolean[] = [];
        const lockRef = { current: false };

        let resolveFinish!: () => void;
        const pending = new Promise<void>((resolve) => {
            resolveFinish = resolve;
        });

        const firstPromise = executeFinishMatch<FinishRoomApiResponse>({
            room: inProgressRoom,
            lockRef,
            requestFinish: async () => {
                calls += 1;
                await pending;
                return {
                    room: apiFinishedRoom,
                    ranking: [
                        { id: 'gp-1', nickname: 'Alice', score: 140, position: 1 },
                        { id: 'gp-2', nickname: 'Bob', score: 0, position: 2 },
                    ],
                    alreadyFinished: false,
                };
            },
            onFinishingChange: (finishing) => loadingStates.push(finishing),
            onError: (msg) => {
                lastError = msg;
            },
            onSuccess: (response, original) => {
                currentRoom = mapApiRoomToModel(response.room, {
                    name: original.name,
                    theme: original.theme,
                    questionIds: original.questionIds,
                });
            },
        });

        // Segundo clique enquanto em andamento deve ser ignorado
        const duplicateOk = await executeFinishMatch({
            room: inProgressRoom,
            lockRef,
            requestFinish: async () => {
                calls += 1;
                return { room: apiFinishedRoom };
            },
            onError: () => {},
            onSuccess: () => {},
        });
        assert.equal(duplicateOk, false);
        assert.equal(calls, 1);
        assert.equal(currentRoom.backendStatus, 'IN_PROGRESS');

        resolveFinish();
        const ok = await firstPromise;

        assert.equal(ok, true);
        assert.equal(lastError, null);
        assert.deepEqual(loadingStates, [true, false]);
        assert.equal(currentRoom.backendStatus, 'FINISHED');
        assert.equal(currentRoom.status, 'Finalizado');
        assert.equal(currentRoom.players[0]?.score, 140);
    });

    it('3. trata erros HTTP (401/403/404/409) e erro de rede sem alterar o status atual da sala', async () => {
        let errorMessage: string | null = null;
        const lockRef = { current: false };
        let currentStatus = inProgressRoom.backendStatus;

        const ok = await executeFinishMatch({
            room: inProgressRoom,
            lockRef,
            requestFinish: async () => {
                throw new ApiError('A partida não está em andamento para ser encerrada.', 409);
            },
            onError: (msg) => {
                errorMessage = msg;
            },
            onSuccess: () => {
                currentStatus = 'FINISHED';
            },
        });

        assert.equal(ok, false);
        assert.equal(currentStatus, 'IN_PROGRESS');
        assert.equal(errorMessage, 'A partida não está em andamento para ser encerrada.');
        assert.match(formatFinishMatchError(new ApiError('', 401)), /sessão expirou/i);
        assert.match(formatFinishMatchError(new ApiError('', 403)), /não tem permissão/i);
        assert.match(formatFinishMatchError(new Error('Failed to fetch')), /conectar ao servidor/i);
    });

    it('4. Dashboard, ViewModel do Host e ViewModel do Jogador integram confirmação, tela de resultados e ranking no game:finished', () => {
        const dashboardSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/features/Dashboard/components/DashboardForm.tsx'),
            'utf8',
        );
        const hostVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );
        const playVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );

        // Host UI: botão Encerrar Partida + diálogo de confirmação
        assert.match(dashboardSource, /Encerrar Partida/);
        assert.match(dashboardSource, /requestFinishMatch/);
        assert.match(dashboardSource, /Encerrar partida agora\?/);
        assert.match(dashboardSource, /confirmFinishMatch/);
        assert.match(dashboardSource, /isLoading=\{roomsVm\.isFinishingMatch\}/);

        // Host VM: executa finishRoomApi, limpa activeRound e abre relatório/resultados
        assert.match(hostVmSource, /executeFinishMatch/);
        assert.match(hostVmSource, /finishRoomApi/);
        assert.match(hostVmSource, /openGameReport/);
        assert.match(hostVmSource, /socket\.on\('game:finished'/);

        // Player VM: recebe ranking de game:finished mesmo sem round:closed prévio e transiciona para 'finished'
        assert.match(playVmSource, /socket\.on\('game:finished', \(payload\?: GameFinishedPayload\)/);
        assert.match(playVmSource, /Array\.isArray\(payload\?\.ranking\)/);
        assert.match(playVmSource, /setServerRanking\(updatedRanking\)/);
        assert.match(playVmSource, /setPhase\('finished'\)/);
    });
});
