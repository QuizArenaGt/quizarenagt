import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCleanPlayerMatchState } from '../src/models/game.ts';
import {
    applyGameCreatedToRooms,
    canPlayAgain,
    executePlayAgain,
    formatPlayAgainError,
    isRoomOpen,
    upsertRoomInList,
    type Room,
} from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import {
    mapApiRoomToModel,
    playAgainApi,
    type ApiHostRoom,
} from '../src/services/roomStorageService.ts';

describe('Etapa 3.1 — Integração do Replay no Frontend', () => {
    const finishedRoom: Room = {
        id: 'room-replay-1',
        code: 'RPL123',
        name: 'Sala Replay',
        theme: 'Ciências',
        timeLimit: 30,
        maxPlayers: 10,
        gameMode: 'CLASSIC',
        status: 'Finalizado',
        backendStatus: 'FINISHED',
        currentGameId: 'game-1',
        questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
        players: [
            {
                id: 'gp-old-1',
                nickname: 'Alice',
                score: 250,
                joinedAt: '2026-11-18T12:00:00.000Z',
            },
            {
                id: 'gp-old-2',
                nickname: 'Bob',
                score: 120,
                joinedAt: '2026-11-18T12:01:00.000Z',
            },
        ],
    };

    const nextApiRoomResponse: ApiHostRoom = {
        id: 'room-replay-1',
        code: 'RPL123',
        name: 'Sala Replay',
        theme: 'Ciências',
        hostId: 'host-1',
        maxPlayers: 10,
        questionTime: 30,
        gameMode: 'CLASSIC',
        status: 'WAITING',
        roomStatus: 'ACTIVE',
        archivedAt: null,
        createdAt: '2026-11-18T11:50:00.000Z',
        updatedAt: '2026-11-18T12:30:00.000Z',
        players: [],
        currentGame: {
            id: 'game-2',
            status: 'WAITING',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: null,
            finishedAt: null,
            createdAt: '2026-11-18T12:30:00.000Z',
            playerCount: 0,
            players: [],
        },
    };

    it('1. deve exibir ação "Jogar novamente" após FINISHED e ocultar enquanto WAITING ou IN_PROGRESS', () => {
        assert.equal(canPlayAgain(finishedRoom), true);
        assert.equal(
            canPlayAgain({ ...finishedRoom, backendStatus: 'CANCELLED' }),
            true,
        );
        assert.equal(
            canPlayAgain({ ...finishedRoom, backendStatus: 'WAITING', status: 'Aguardando' }),
            false,
        );
        assert.equal(
            canPlayAgain({ ...finishedRoom, backendStatus: 'IN_PROGRESS', status: 'Em Andamento' }),
            false,
        );
        assert.equal(canPlayAgain(null), false);

        const dashboardSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/features/Dashboard/components/DashboardForm.tsx'),
            'utf8',
        );
        assert.match(dashboardSource, /canPlayAgain\(activeRoom\)/);
        assert.match(dashboardSource, /Jogar novamente/);
    });

    it('2. playAgainApi deve chamar POST /rooms/:id/play-again corretamente', async () => {
        const originalFetch = globalThis.fetch;
        let calledUrl = '';
        let calledMethod = '';

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calledUrl = String(input);
            calledMethod = init?.method ?? 'GET';
            return new Response(JSON.stringify(nextApiRoomResponse), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as typeof fetch;

        try {
            const response = await playAgainApi('room-replay-1');
            assert.equal(calledUrl.endsWith('/rooms/room-replay-1/play-again'), true);
            assert.equal(calledMethod, 'POST');
            assert.equal(response.status, 'WAITING');
            assert.equal(response.currentGame?.id, 'game-2');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('3. executePlayAgain deve atualizar a sala para o novo Game WAITING, retornar ao lobby e não duplicar sala', async () => {
        let roomsState: Room[] = [finishedRoom];
        let capturedError: string | null = 'erro-previo';
        const lockRef = { current: false };

        const result = await executePlayAgain({
            room: finishedRoom,
            lockRef,
            requestPlayAgain: async () => nextApiRoomResponse,
            mapRoom: (apiRoom, existing) =>
                mapApiRoomToModel(apiRoom, {
                    name: existing.name,
                    theme: existing.theme,
                    questionIds: existing.questionIds,
                }),
            onError: (err) => {
                capturedError = err;
            },
            onSuccess: (mappedRoom) => {
                roomsState = upsertRoomInList(roomsState, mappedRoom);
            },
        });

        assert.equal(capturedError, null);
        assert.notEqual(result, null);
        assert.equal(roomsState.length, 1);
        assert.equal(roomsState[0].id, finishedRoom.id);
        assert.equal(roomsState[0].backendStatus, 'WAITING');
        assert.equal(roomsState[0].status, 'Aguardando');
        assert.equal(isRoomOpen(roomsState[0]), true);
        assert.equal(roomsState[0].currentGameId, 'game-2');
        assert.deepEqual(roomsState[0].players, []);
        assert.deepEqual(roomsState[0].questionIds, finishedRoom.questionIds);
        assert.equal(lockRef.current, false);
    });

    it('4. deve tratar erro HTTP 409 (e 401/403/404) mantendo estado da sala e liberando nova tentativa', async () => {
        let roomsState: Room[] = [finishedRoom];
        let capturedError: string | null = null;
        const lockRef = { current: false };

        const result = await executePlayAgain({
            room: finishedRoom,
            lockRef,
            requestPlayAgain: async () => {
                throw new ApiError('Já existe uma partida ativa para esta sala.', 409);
            },
            mapRoom: (apiRoom, existing) =>
                mapApiRoomToModel(apiRoom, { questionIds: existing.questionIds }),
            onError: (err) => {
                capturedError = err;
            },
            onSuccess: (mappedRoom) => {
                roomsState = upsertRoomInList(roomsState, mappedRoom);
            },
        });

        assert.equal(result, null);
        assert.equal(capturedError, 'Já existe uma partida ativa para esta sala.');
        assert.equal(roomsState[0].backendStatus, 'FINISHED');
        assert.equal(lockRef.current, false);

        assert.match(formatPlayAgainError(new ApiError('Unauthorized', 401)), /sessão expirou/i);
        assert.match(formatPlayAgainError(new ApiError('Forbidden', 403)), /permissão/i);
        assert.match(formatPlayAgainError(new ApiError('Not Found', 404)), /não encontrada/i);
    });

    it('5. applyGameCreatedToRooms deve sincronizar múltiplas abas e ser idempotente para o mesmo currentGameId', () => {
        const secondTabRooms: Room[] = [finishedRoom];

        const synced = applyGameCreatedToRooms(secondTabRooms, {
            roomId: finishedRoom.id,
            status: 'WAITING',
            maxPlayers: 15,
            questionTime: 45,
            gameMode: 'HARDCORE',
            currentGame: {
                id: 'game-2',
                status: 'WAITING',
                maxPlayers: 15,
                questionTime: 45,
                gameMode: 'HARDCORE',
            },
        });

        assert.equal(synced.didResetLiveGame, true);
        assert.equal(synced.rooms.length, 1);
        assert.equal(synced.rooms[0].backendStatus, 'WAITING');
        assert.equal(synced.rooms[0].status, 'Aguardando');
        assert.equal(synced.rooms[0].currentGameId, 'game-2');
        assert.equal(synced.rooms[0].maxPlayers, 15);
        assert.equal(synced.rooms[0].timeLimit, 45);
        assert.equal(synced.rooms[0].gameMode, 'HARDCORE');
        assert.deepEqual(synced.rooms[0].players, []);

        // Se jogador já entrou no game-2 antes do evento chegar na 1ª aba, não apaga players
        const firstTabWithNewPlayer: Room[] = [
            {
                ...synced.rooms[0],
                players: [
                    {
                        id: 'gp-new-1',
                        nickname: 'Carlos',
                        score: 0,
                        joinedAt: '2026-11-18T12:31:00.000Z',
                    },
                ],
            },
        ];

        const duplicateEvent = applyGameCreatedToRooms(firstTabWithNewPlayer, {
            roomId: finishedRoom.id,
            status: 'WAITING',
            maxPlayers: 15,
            questionTime: 45,
            gameMode: 'HARDCORE',
            currentGame: {
                id: 'game-2',
                status: 'WAITING',
                maxPlayers: 15,
                questionTime: 45,
                gameMode: 'HARDCORE',
            },
        });

        assert.equal(duplicateEvent.didResetLiveGame, false);
        assert.equal(duplicateEvent.rooms[0].players.length, 1);
        assert.equal(duplicateEvent.rooms[0].players[0].nickname, 'Carlos');
    });

    it('6. createCleanPlayerMatchState deve limpar token, nickname, respostas e pontuações antigas do jogador', () => {
        const clean = createCleanPlayerMatchState();

        assert.equal(clean.phase, 'join');
        assert.equal(clean.pin, '');
        assert.equal(clean.nickname, '');
        assert.equal(clean.sessionToken, null);
        assert.equal(clean.playerId, null);
        assert.equal(clean.room, null);
        assert.equal(clean.currentRoundId, null);
        assert.equal(clean.currentQuestion, null);
        assert.deepEqual(clean.lobbyPlayers, []);
        assert.deepEqual(clean.answers, []);
        assert.deepEqual(clean.playedQuestions, []);
        assert.deepEqual(clean.serverRanking, []);
        assert.equal(clean.serverTotalScore, 0);

        const playVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );
        assert.match(playVmSource, /leaveRoom[\s\S]*?resetToJoin\(\)/);
    });
});
