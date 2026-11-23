import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeLeaveRoom } from '../src/models/game.ts';
import {
    applyPlayerLeftToRooms,
    countEligiblePlayers,
    type Room,
} from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import { leaveRoomApi } from '../src/services/roomStorageService.ts';

describe('Saída voluntária do jogador (Frontend)', () => {
    it('leaveRoomApi envia POST /rooms/leave autenticado com o token do jogador', async () => {
        const originalFetch = globalThis.fetch;
        let calledUrl = '';
        let calledMethod = '';
        let authHeader = '';

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calledUrl = String(input);
            calledMethod = init?.method ?? 'GET';
            const headers = new Headers(init?.headers);
            authHeader = headers.get('Authorization') ?? '';

            return new Response(
                JSON.stringify({
                    message: 'Você saiu da sala.',
                    roomId: 'room-1',
                    gameId: 'game-1',
                    gameStatus: 'WAITING',
                    player: {
                        id: 'gp-1',
                        nickname: 'Alice',
                        status: 'LEFT',
                        score: 0,
                    },
                    eligiblePlayerCount: 1,
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }) as typeof fetch;

        try {
            const response = await leaveRoomApi('player-session-token');
            assert.match(calledUrl, /\/rooms\/leave$/);
            assert.equal(calledMethod, 'POST');
            assert.equal(authHeader, 'Bearer player-session-token');
            assert.equal(response.gameStatus, 'WAITING');
            assert.equal(response.eligiblePlayerCount, 1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('executeLeaveRoom evita chamadas duplicadas, controla loading e só limpa/navega após sucesso', async () => {
        const lockRef = { current: false };
        const loadingStates: boolean[] = [];
        const errors: (string | null)[] = [];
        let leftCount = 0;
        let calls = 0;
        let resolveRequest!: () => void;

        const firstPromise = executeLeaveRoom({
            phase: 'lobby',
            sessionToken: 'token-123',
            lockRef,
            requestLeave: () => {
                calls += 1;
                return new Promise<void>((resolve) => {
                    resolveRequest = resolve;
                });
            },
            setIsLeaving: (value) => loadingStates.push(value),
            setError: (value) => errors.push(value),
            onLeft: () => {
                leftCount += 1;
            },
        });

        const duplicateResult = await executeLeaveRoom({
            phase: 'lobby',
            sessionToken: 'token-123',
            lockRef,
            requestLeave: async () => {
                calls += 1;
            },
            setIsLeaving: (value) => loadingStates.push(value),
            setError: (value) => errors.push(value),
            onLeft: () => {
                leftCount += 1;
            },
        });

        assert.equal(duplicateResult, false);
        assert.equal(calls, 1);
        assert.equal(leftCount, 0);

        resolveRequest();
        const firstResult = await firstPromise;

        assert.equal(firstResult, true);
        assert.equal(leftCount, 1);
        assert.deepEqual(loadingStates, [true, false]);
        assert.deepEqual(errors, [null]);
    });

    it('executeLeaveRoom preserva estado e expõe erro quando API falha, e pula API em join/finished', async () => {
        const lockRef = { current: false };
        let errorMessage: string | null = null;
        let leftCount = 0;

        const failed = await executeLeaveRoom({
            phase: 'question',
            sessionToken: 'token-123',
            lockRef,
            requestLeave: async () => {
                throw new ApiError('Falha ao processar saída.', 500);
            },
            setIsLeaving: () => {},
            setError: (msg) => {
                errorMessage = msg;
            },
            onLeft: () => {
                leftCount += 1;
            },
        });

        assert.equal(failed, false);
        assert.equal(errorMessage, 'Falha ao processar saída.');
        assert.equal(leftCount, 0);
        assert.equal(lockRef.current, false);

        let apiCalledInFinished = false;
        const finishedResult = await executeLeaveRoom({
            phase: 'finished',
            sessionToken: 'token-123',
            lockRef,
            requestLeave: async () => {
                apiCalledInFinished = true;
            },
            setIsLeaving: () => {},
            setError: () => {},
            onLeft: () => {
                leftCount += 1;
            },
        });

        assert.equal(finishedResult, true);
        assert.equal(apiCalledInFinished, false);
        assert.equal(leftCount, 1);
    });

    it('applyPlayerLeftToRooms remove em WAITING, marca LEFT preservando score em IN_PROGRESS e countEligiblePlayers exclui inativos', () => {
        const baseRoom: Room = {
            id: 'room-1',
            name: 'Sala Teste',
            theme: 'Geral',
            timeLimit: 30,
            maxPlayers: 5,
            gameMode: 'CLASSIC',
            status: 'Aguardando',
            backendStatus: 'WAITING',
            code: 'ABC123',
            questionIds: [],
            players: [
                { id: 'gp-1', nickname: 'Ana', status: 'ACTIVE', score: 150, joinedAt: '' },
                { id: 'gp-2', nickname: 'Bob', status: 'ACTIVE', score: 100, joinedAt: '' },
            ],
        };

        const afterWaitingLeft = applyPlayerLeftToRooms([baseRoom], {
            roomId: 'room-1',
            gameId: 'game-1',
            gameStatus: 'WAITING',
            player: { id: 'gp-2', nickname: 'Bob', status: 'LEFT', score: 0 },
            eligiblePlayerCount: 1,
        });

        assert.deepEqual(
            afterWaitingLeft[0]?.players.map((p) => p.id),
            ['gp-1'],
        );

        const afterInProgressLeft = applyPlayerLeftToRooms([baseRoom], {
            roomId: 'room-1',
            gameId: 'game-1',
            gameStatus: 'IN_PROGRESS',
            player: { id: 'gp-2', nickname: 'Bob', status: 'LEFT', score: 100 },
            eligiblePlayerCount: 1,
        });

        assert.equal(afterInProgressLeft[0]?.players.length, 2);
        assert.equal(afterInProgressLeft[0]?.players[1]?.status, 'LEFT');
        assert.equal(afterInProgressLeft[0]?.players[1]?.score, 100);
        assert.equal(countEligiblePlayers(afterInProgressLeft[0]!.players), 1);
    });
});
