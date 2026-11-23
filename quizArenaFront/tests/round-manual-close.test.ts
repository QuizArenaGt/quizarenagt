import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeCloseRound, formatCloseRoundError } from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import { closeRoundApi } from '../src/services/roomStorageService.ts';
import type { RoundClosedPayload } from '../src/services/socket.ts';

describe('Botão Encerrar Rodada & Remoção de Atualizar Lobby (Frontend)', () => {
    const sampleClosedPayload: RoundClosedPayload = {
        round: {
            id: 'round-open-1',
            roundNumber: 1,
            status: 'CLOSED',
            openedAt: '2026-11-20T16:00:00.000Z',
            expiresAt: '2026-11-20T16:00:30.000Z',
            closedAt: '2026-11-20T16:00:10.000Z',
            question: {
                id: 'sq-1',
                statement: 'Pergunta 1',
                options: [
                    { id: 'opt-1', text: 'Correta', isCorrect: true },
                    { id: 'opt-2', text: 'Errada', isCorrect: false },
                ],
            },
            answers: [
                {
                    id: 'ans-1',
                    player: { id: 'gp-1', nickname: 'Alice' },
                    option: { id: 'opt-1', text: 'Correta' },
                    isCorrect: true,
                    points: 130,
                    answeredAt: '2026-11-20T16:00:05.000Z',
                },
            ],
            unansweredPlayers: [{ id: 'gp-2', nickname: 'Bob' }],
            ranking: [
                { id: 'gp-1', nickname: 'Alice', score: 130 },
                { id: 'gp-2', nickname: 'Bob', score: 0 },
            ],
        },
    };

    it('1. closeRoundApi chama POST /rounds/:id/close corretamente', async () => {
        const originalFetch = globalThis.fetch;
        let calledUrl = '';
        let calledMethod = '';

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calledUrl = String(input);
            calledMethod = init?.method ?? 'GET';
            return new Response(JSON.stringify(sampleClosedPayload), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as typeof fetch;

        try {
            const response = await closeRoundApi('round-open-1');
            assert.match(calledUrl, /\/rounds\/round-open-1\/close$/);
            assert.equal(calledMethod, 'POST');
            assert.equal(response.round.status, 'CLOSED');
            assert.equal(response.round.ranking[0]?.score, 130);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('2. executeCloseRound encerra manualmente com prevenção contra clique duplicado e libera em caso de erro', async () => {
        const closingRoundIdRef: { current: string | null } = { current: null };
        const loadingStates: boolean[] = [];
        let calls = 0;
        const closedResultHolder: { round: RoundClosedPayload['round'] | null } = { round: null };
        let errorMessage: string | null = 'erro-previo';

        let resolveClose!: () => void;
        const pending = new Promise<void>((resolve) => {
            resolveClose = resolve;
        });

        const firstPromise = executeCloseRound({
            roundId: 'round-open-1',
            closingRoundIdRef,
            requestClose: async () => {
                calls += 1;
                await pending;
                return sampleClosedPayload;
            },
            onClosingChange: (closing) => loadingStates.push(closing),
            onError: (msg) => {
                errorMessage = msg;
            },
            onSuccess: (res) => {
                closedResultHolder.round = res.round;
            },
        });

        // Clique duplicado na mesma rodada enquanto em voo deve ser ignorado
        const duplicateOk = await executeCloseRound({
            roundId: 'round-open-1',
            closingRoundIdRef,
            requestClose: async () => {
                calls += 1;
                return sampleClosedPayload;
            },
            onError: () => {},
            onSuccess: () => {},
        });
        assert.equal(duplicateOk, false);
        assert.equal(calls, 1);

        resolveClose();
        const ok = await firstPromise;

        assert.equal(ok, true);
        assert.equal(errorMessage, null);
        assert.equal(closedResultHolder.round?.id, 'round-open-1');
        assert.deepEqual(loadingStates, [true, false]);

        // Em erro HTTP, libera ref para nova tentativa e formata mensagem
        const retryRef: { current: string | null } = { current: null };
        const failOk = await executeCloseRound({
            roundId: 'round-open-2',
            closingRoundIdRef: retryRef,
            requestClose: async () => {
                throw new ApiError('Você não tem permissão para encerrar esta rodada.', 403);
            },
            onError: (msg) => {
                errorMessage = msg;
            },
            onSuccess: () => {},
        });
        assert.equal(failOk, false);
        assert.equal(retryRef.current, null);
        assert.equal(errorMessage, 'Você não tem permissão para encerrar esta rodada.');
        assert.match(formatCloseRoundError(new ApiError('', 401)), /sessão expirou/i);
    });

    it('3. DashboardForm mantém "Encerrar Rodada" habilitado antes do timer/respostas e remove botão obsoleto "Atualizar Lobby"', () => {
        const dashboardSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/features/Dashboard/components/DashboardForm.tsx'),
            'utf8',
        );
        const hostVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );

        // Botão Encerrar Rodada existe com o mesmo nome e só desabilita enquanto isClosingRound
        assert.match(dashboardSource, /Encerrar Rodada/);
        assert.match(dashboardSource, /disabled=\{roomsVm\.isClosingRound\}/);
        assert.doesNotMatch(
            dashboardSource,
            /roundRemainingSeconds\s*>\s*0\s*&&[\s\S]*?answeredPlayers\.length\s*<\s*activeRoom\.players\.length/,
        );

        // Botão Atualizar Lobby e propriedade refreshActiveRoomLobby foram removidos sem deixar código morto
        assert.doesNotMatch(dashboardSource, /Atualizar Lobby/);
        assert.doesNotMatch(dashboardSource, /refreshActiveRoomLobby/);
        assert.doesNotMatch(hostVmSource, /refreshActiveRoomLobby/);

        // Sincronização automática via Socket.IO permanece intacta
        assert.match(hostVmSource, /socket\.on\('player:joined'/);
        assert.match(hostVmSource, /socket\.on\('round:started'/);
        assert.match(hostVmSource, /socket\.on\('round:answer-submitted'/);
        assert.match(hostVmSource, /socket\.on\('round:closed'/);
        assert.match(hostVmSource, /socket\.on\('game:finished'/);
    });
});
