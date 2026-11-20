import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    executeArchiveRoom,
    executeLoadHostRooms,
    formatArchiveRoomError,
    type HostSessionTracker,
    type Room,
} from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import {
    archiveRoomApi,
    listHostRoomsApi,
    mapApiRoomToModel,
    type ApiHostRoom,
} from '../src/services/roomStorageService.ts';

describe('Arquivamento / Remoção de Salas no Frontend (Soft Delete)', () => {
    const activeRoom: Room = {
        id: 'room-arch-1',
        code: 'ARC123',
        name: 'Sala Arquivamento',
        theme: 'Tecnologia',
        timeLimit: 30,
        maxPlayers: 10,
        gameMode: 'CLASSIC',
        status: 'Finalizado',
        backendStatus: 'FINISHED',
        currentGameId: 'game-1',
        questionIds: [],
        players: [],
    };

    const otherActiveRoom: Room = {
        ...activeRoom,
        id: 'room-keep-2',
        code: 'KEP456',
        name: 'Sala Mantida',
    };

    it('1 e 8. archiveRoomApi envia DELETE /rooms/:id com autenticação e retorna sala arquivada', async () => {
        const originalFetch = globalThis.fetch;
        let calledUrl = '';
        let calledMethod = '';

        const apiArchivedRoom: ApiHostRoom = {
            id: activeRoom.id,
            code: activeRoom.code,
            name: activeRoom.name,
            theme: activeRoom.theme,
            hostId: 'host-1',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            status: 'FINISHED',
            roomStatus: 'ARCHIVED',
            archivedAt: '2026-11-20T12:00:00.000Z',
            createdAt: '2026-11-18T12:00:00.000Z',
            updatedAt: '2026-11-20T12:00:00.000Z',
        };

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calledUrl = String(input);
            calledMethod = init?.method ?? 'GET';
            return new Response(
                JSON.stringify({
                    message: 'Sala arquivada com sucesso.',
                    room: apiArchivedRoom,
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }) as typeof fetch;

        try {
            const result = await archiveRoomApi(activeRoom.id);
            assert.match(calledUrl, /\/rooms\/room-arch-1$/);
            assert.equal(calledMethod, 'DELETE');
            assert.equal(result?.roomStatus, 'ARCHIVED');
            assert.equal(result?.archivedAt, '2026-11-20T12:00:00.000Z');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('2 e 8. executeArchiveRoom remove a sala da lista apenas após confirmação do servidor e impede duplo envio', async () => {
        let rooms = [activeRoom, otherActiveRoom];
        let requestCalls = 0;
        let lastError: string | null = 'erro-anterior';
        const loadingHistory: boolean[] = [];
        const lockRef = { current: false };

        let resolveArchive!: () => void;
        const slowRequest = new Promise<void>((resolve) => {
            resolveArchive = resolve;
        });

        const firstPromise = executeArchiveRoom({
            room: activeRoom,
            lockRef,
            requestArchive: async () => {
                requestCalls += 1;
                await slowRequest;
            },
            onArchivingChange: (loading) => loadingHistory.push(loading),
            onError: (msg) => {
                lastError = msg;
            },
            onSuccess: (archivedId) => {
                rooms = rooms.filter((r) => r.id !== archivedId);
            },
        });

        // Enquanto pendente: sala ainda está na lista e segunda chamada é bloqueada
        assert.equal(rooms.length, 2);
        const duplicateResult = await executeArchiveRoom({
            room: activeRoom,
            lockRef,
            requestArchive: async () => {
                requestCalls += 1;
            },
            onError: () => {},
            onSuccess: () => {},
        });
        assert.equal(duplicateResult, false);
        assert.equal(requestCalls, 1);

        resolveArchive();
        const ok = await firstPromise;

        assert.equal(ok, true);
        assert.equal(lastError, null);
        assert.deepEqual(loadingHistory, [true, false]);
        assert.deepEqual(
            rooms.map((r) => r.id),
            [otherActiveRoom.id],
        );
    });

    it('5 e 8. em falha HTTP (401/403/404) ou erro de rede, mantém a sala na UI e apresenta mensagem de erro ao usuário', async () => {
        let rooms = [activeRoom, otherActiveRoom];
        let errorMessage: string | null = null;
        const lockRef = { current: false };

        const ok = await executeArchiveRoom({
            room: activeRoom,
            lockRef,
            requestArchive: async () => {
                throw new ApiError('Você não tem permissão para excluir esta sala.', 403);
            },
            onError: (msg) => {
                errorMessage = msg;
            },
            onSuccess: (archivedId) => {
                rooms = rooms.filter((r) => r.id !== archivedId);
            },
        });

        assert.equal(ok, false);
        assert.equal(errorMessage, 'Você não tem permissão para excluir esta sala.');
        assert.equal(rooms.length, 2);
        assert.equal(lockRef.current, false);

        assert.match(
            formatArchiveRoomError(new ApiError('', 401)),
            /sessão expirou/i,
        );
        assert.match(
            formatArchiveRoomError(new Error('Failed to fetch')),
            /conectar ao servidor/i,
        );
    });

    it('7. simular F5 após arquivamento: listHostRoomsApi retorna apenas salas ativas e a sala arquivada não reaparece', async () => {
        const originalFetch = globalThis.fetch;
        const trackerRef: { current: HostSessionTracker } = {
            current: { activeSessionKey: null, requestSeq: 0 },
        };

        const remainingServerRoom: ApiHostRoom = {
            id: otherActiveRoom.id,
            code: otherActiveRoom.code,
            name: otherActiveRoom.name,
            theme: otherActiveRoom.theme,
            hostId: 'host-1',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            status: 'WAITING',
            roomStatus: 'ACTIVE',
            archivedAt: null,
            createdAt: '2026-11-18T12:00:00.000Z',
            updatedAt: '2026-11-18T12:00:00.000Z',
            players: [],
        };

        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ rooms: [remainingServerRoom] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })) as typeof fetch;

        try {
            let reloadedRooms: Room[] = [];
            await executeLoadHostRooms({
                sessionKey: 'host-token-1',
                expectedHostId: 'host-1',
                requestedUrlCode: activeRoom.code, // Mesmo se ?sala= ainda estivesse na URL após arquivamento
                trackerRef,
                existingRooms: [],
                fetchHostRooms: () => listHostRoomsApi('host-token-1'),
                mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
                onResetSessionState: () => {},
                onError: () => {},
                onSuccess: ({ rooms, selectedRoomId, shouldClearUrlParam }) => {
                    reloadedRooms = rooms;
                    assert.equal(selectedRoomId, null);
                    assert.equal(shouldClearUrlParam, true);
                },
            });

            assert.equal(reloadedRooms.length, 1);
            assert.equal(reloadedRooms[0]?.id, otherActiveRoom.id);
            assert.equal(
                reloadedRooms.some((r) => r.id === activeRoom.id),
                false,
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('confirmDelete no Dashboard e ViewModel utiliza executeArchiveRoom + archiveRoomApi com confirmação informando preservação do histórico', () => {
        const vmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );
        const dashboardSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/features/Dashboard/components/DashboardForm.tsx'),
            'utf8',
        );

        assert.match(vmSource, /executeArchiveRoom/);
        assert.match(vmSource, /archiveRoomApi/);
        assert.match(vmSource, /archiveRoomError/);
        assert.match(vmSource, /isArchivingRoom/);
        assert.match(vmSource, /room:archived/);

        assert.match(dashboardSource, /Excluir sala\?/);
        assert.match(dashboardSource, /histórico de partidas e os resultados anteriores permanecerão preservados/i);
        assert.match(dashboardSource, /roomsVm\.archiveRoomError/);
        assert.match(dashboardSource, /isLoading=\{roomsVm\.isArchivingRoom\}/);
    });
});
