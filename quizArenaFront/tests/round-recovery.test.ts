import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeRemainingSecondsFromDeadline,
    extractHostMatchRecoveryState,
} from '../src/models/room.ts';
import type { ApiGameSummary } from '../src/services/roomStorageService.ts';

describe('Recuperação de Rodada após F5, Timer Autoritativo e Reconexão (Frontend)', () => {
    const baseQuestion = {
        id: 'snap-q-1',
        statement: 'Qual protocolo garante entrega ordenada?',
        type: 'MULTIPLE_CHOICE' as const,
        position: 0,
        options: [
            { id: 'opt-1', text: 'TCP', position: 0 },
            { id: 'opt-2', text: 'UDP', position: 1 },
        ],
    };

    it('1. computeRemainingSecondsFromDeadline calcula segundos restantes a partir de expiresAt e simula múltiplas abas/reloads sem resetar para timeLimit', () => {
        const openedAt = '2026-11-19T12:00:00.000Z';
        const expiresAt = '2026-11-19T12:00:30.000Z';
        const nowAfterReloadMs = Date.parse('2026-11-19T12:00:17.200Z'); // 12.8s restantes -> ceil = 13s

        const remaining = computeRemainingSecondsFromDeadline(
            expiresAt,
            openedAt,
            30,
            nowAfterReloadMs,
        );
        assert.equal(remaining, 13);

        // Quando já expirou, nunca fica negativo
        const afterExpirationMs = Date.parse('2026-11-19T12:00:35.000Z');
        assert.equal(
            computeRemainingSecondsFromDeadline(expiresAt, openedAt, 30, afterExpirationMs),
            0,
        );

        // Fallback defensivo caso expiresAt falte em payload legado
        assert.equal(
            computeRemainingSecondsFromDeadline(undefined, openedAt, 30, nowAfterReloadMs),
            13,
        );
    });

    it('2. F5 com rodada OPEN recupera pergunta ativa, quem já respondeu e cronômetro coerente sem criar nova rodada', () => {
        const nowMs = Date.parse('2026-11-19T12:00:20.000Z');
        const currentGame: ApiGameSummary = {
            id: 'game-1',
            status: 'IN_PROGRESS',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-19T11:59:00.000Z',
            finishedAt: null,
            createdAt: '2026-11-19T11:58:00.000Z',
            playerCount: 2,
            eligiblePlayerCount: 2,
            totalQuestions: 5,
            completedRoundsCount: 1,
            completedRounds: [],
            activeRound: {
                id: 'round-2',
                roundNumber: 2,
                status: 'OPEN',
                openedAt: '2026-11-19T12:00:00.000Z',
                expiresAt: '2026-11-19T12:00:30.000Z',
                timeLimit: 30,
                question: baseQuestion,
                answeredCount: 1,
                eligiblePlayerCount: 2,
                answeredPlayers: [{ id: 'gp-1', nickname: 'Alice' }],
            },
            lastClosedRound: null,
            players: [
                {
                    id: 'gp-1',
                    nickname: 'Alice',
                    score: 120,
                    joinedAt: '2026-11-19T11:58:10.000Z',
                },
                {
                    id: 'gp-2',
                    nickname: 'Bob',
                    score: 0,
                    joinedAt: '2026-11-19T11:58:20.000Z',
                },
            ],
        };

        const recovered = extractHostMatchRecoveryState(currentGame, nowMs);

        assert.equal(recovered.activeRound?.id, 'round-2');
        assert.equal(recovered.activeRound?.roundNumber, 2);
        assert.equal(recovered.closedRound, null);
        assert.deepEqual(recovered.answeredPlayers, [{ id: 'gp-1', nickname: 'Alice' }]);
        // Nunca reinicia para 30s após F5 aos 20s
        assert.equal(recovered.remainingSeconds, 10);
    });

    it('3. F5 após encerramento automático de rodada restaura lastClosedRound em IN_PROGRESS e limpa tudo ao finalizar partida (FINISHED)', () => {
        const closedRoundPayload = {
            id: 'round-2',
            roundNumber: 2,
            status: 'CLOSED' as const,
            openedAt: '2026-11-19T12:00:00.000Z',
            expiresAt: '2026-11-19T12:00:30.000Z',
            closedAt: '2026-11-19T12:00:30.100Z',
            question: {
                id: 'snap-q-2',
                statement: 'Qual porta padrão HTTPS?',
                options: [
                    { id: 'opt-1', text: '443', isCorrect: true },
                    { id: 'opt-2', text: '80', isCorrect: false },
                ],
            },
            answers: [],
            unansweredPlayers: [{ id: 'gp-2', nickname: 'Bob' }],
            ranking: [
                { id: 'gp-1', nickname: 'Alice', score: 120 },
                { id: 'gp-2', nickname: 'Bob', score: 0 },
            ],
        };

        const inProgressAfterAutoClose: ApiGameSummary = {
            id: 'game-1',
            status: 'IN_PROGRESS',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-19T11:59:00.000Z',
            finishedAt: null,
            createdAt: '2026-11-19T11:58:00.000Z',
            playerCount: 2,
            activeRound: null,
            lastClosedRound: closedRoundPayload,
            players: [],
        };

        const recoveredInProgress = extractHostMatchRecoveryState(inProgressAfterAutoClose);
        assert.equal(recoveredInProgress.activeRound, null);
        assert.equal(recoveredInProgress.closedRound?.id, 'round-2');
        assert.equal(recoveredInProgress.remainingSeconds, 0);

        const finishedGame: ApiGameSummary = {
            ...inProgressAfterAutoClose,
            status: 'FINISHED',
            finishedAt: '2026-11-19T12:05:00.000Z',
        };
        const recoveredFinished = extractHostMatchRecoveryState(finishedGame);
        assert.equal(recoveredFinished.activeRound, null);
        assert.equal(recoveredFinished.closedRound, null);
    });

    it('4. host ViewModel não dispara POST /rounds/:id/close automaticamente no setInterval do navegador e usa expiresAt autoritativo', () => {
        const hostVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );

        // O timer visual apenas recalcula countdown a partir de expiresAt
        const marker = '// Cronômetro estritamente visual';
        const markerIdx = hostVmSource.indexOf(marker);
        assert.ok(markerIdx !== -1, 'Deve existir bloco do cronômetro visual');
        const timerBlockEndIdx = hostVmSource.indexOf('[activeRound]);', markerIdx);
        assert.ok(timerBlockEndIdx !== -1, 'Deve existir effect do cronômetro baseado em activeRound');
        const timerEffectSlice = hostVmSource.slice(markerIdx, timerBlockEndIdx);
        assert.match(timerEffectSlice, /computeRemainingSecondsFromDeadline/);
        assert.doesNotMatch(timerEffectSlice, /closeCurrentRound/);
        assert.doesNotMatch(timerEffectSlice, /closeRoundApi/);
    });

    it('5 e 6. Socket.IO resincroniza estado no reconnect, evita duplicações por idempotência e transiciona para resultado final no game:finished', () => {
        const hostVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );
        const playVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );

        // Host: resincroniza no connect, aplica applyHostRoundRecovery no F5, evita duplicação e limpa no game:finished
        assert.match(hostVmSource, /socket\.on\('connect'/);
        assert.match(hostVmSource, /applyHostRoundRecovery/);
        assert.match(hostVmSource, /activeRoundIdRef/);
        assert.match(hostVmSource, /socket\.on\('game:finished'/);
        assert.match(hostVmSource, /socket\.disconnect\(\)/);

        // Jogador: resincroniza no connect via fetchPlayerLobby, calcula countdown com expiresAt e transiciona para 'finished'
        assert.match(playVmSource, /socket\.on\('connect'/);
        assert.match(playVmSource, /fetchPlayerLobby/);
        assert.match(playVmSource, /currentRoundIdRef/);
        assert.match(playVmSource, /computeRemainingSecondsFromDeadline/);
        assert.match(playVmSource, /socket\.on\('game:finished'/);
        assert.match(playVmSource, /setPhase\('finished'\)/);
        assert.match(playVmSource, /socket\.disconnect\(\)/);
    });
});
