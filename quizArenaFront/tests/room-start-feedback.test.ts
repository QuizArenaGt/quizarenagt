import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyStartMatchError,
    evaluateStartMatchRequirements,
    executeStartMatch,
    formatStartMatchError,
    resolveStartMatchFeedback,
    shouldClearStartMatchFeedbackOnRequirementsMet,
    type Room,
    type StartMatchErrorKind,
} from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import { startRoomApi } from '../src/services/roomStorageService.ts';

describe('Feedback de requisitos mínimos para iniciar partida (Frontend)', () => {
    const waitingRoom: Room = {
        id: 'room-start-1',
        code: 'STR123',
        name: 'Sala Teste Início',
        theme: 'Geral',
        timeLimit: 30,
        maxPlayers: 10,
        gameMode: 'CLASSIC',
        status: 'Aguardando',
        backendStatus: 'WAITING',
        currentGameId: 'game-1',
        questionIds: [],
        players: [],
    };

    it('1. evaluateStartMatchRequirements sinaliza separadamente falta de perguntas, falta de jogadores, ambos pendentes e requisitos atendidos', () => {
        const onlyMissingQuestions = evaluateStartMatchRequirements(2, 3);
        assert.equal(onlyMissingQuestions.canStart, false);
        assert.equal(onlyMissingQuestions.missingQuestions, true);
        assert.equal(onlyMissingQuestions.missingQuestionsCount, 2);
        assert.equal(onlyMissingQuestions.missingPlayers, false);
        assert.match(onlyMissingQuestions.summaryMessage ?? '', /faltam 2 perguntas ativas/i);
        assert.doesNotMatch(onlyMissingQuestions.summaryMessage ?? '', /jogador/i);

        const onlyMissingPlayers = evaluateStartMatchRequirements(1, 5);
        assert.equal(onlyMissingPlayers.canStart, false);
        assert.equal(onlyMissingPlayers.missingPlayers, true);
        assert.equal(onlyMissingPlayers.missingPlayersCount, 1);
        assert.equal(onlyMissingPlayers.missingQuestions, false);
        assert.match(onlyMissingPlayers.summaryMessage ?? '', /falta 1 jogador ativo/i);
        assert.doesNotMatch(onlyMissingPlayers.summaryMessage ?? '', /pergunta/i);

        const bothMissing = evaluateStartMatchRequirements(0, 2);
        assert.equal(bothMissing.canStart, false);
        assert.equal(bothMissing.missingPlayers, true);
        assert.equal(bothMissing.missingQuestions, true);
        assert.match(bothMissing.summaryMessage ?? '', /3 perguntas ativas/i);
        assert.match(bothMissing.summaryMessage ?? '', /2 jogadores ativos/i);

        const allReady = evaluateStartMatchRequirements(2, 5);
        assert.equal(allReady.canStart, true);
        assert.equal(allReady.summaryMessage, null);
    });

    it('2. executeStartMatch sempre consulta o backend e exibe rejeição 409 clara para players, questions ou ambos sem duplicar alertas', async () => {
        const originalFetch = globalThis.fetch;
        const lockRef = { current: false };
        const capturedErrors: (string | null)[] = [];

        const backendMessages = [
            'Não é possível iniciar a partida: são necessários pelo menos 2 jogadores ativos (atual: 1) e pelo menos 5 perguntas ativas (atual: 3).',
            'São necessárias pelo menos 5 perguntas ativas para iniciar a partida (atual: 4).',
            'São necessários pelo menos 2 jogadores ativos para iniciar a partida (atual: 1).',
        ];

        try {
            for (const serverMessage of backendMessages) {
                globalThis.fetch = (async () =>
                    new Response(
                        JSON.stringify({
                            message: serverMessage,
                            code: 'START_REQUIREMENTS_NOT_MET',
                        }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )) as typeof fetch;

                let startedCalled = false;
                const ok = await executeStartMatch({
                    room: waitingRoom,
                    lockRef,
                    requestStart: startRoomApi,
                    onError: (msg) => capturedErrors.push(msg),
                    onStarted: () => {
                        startedCalled = true;
                    },
                });

                assert.equal(ok, false);
                assert.equal(startedCalled, false);
                assert.equal(capturedErrors[capturedErrors.length - 1], serverMessage);
            }
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('3. executeStartMatch trata início bem-sucedido, bloqueia duplo clique simultâneo e formata falhas inesperadas', async () => {
        const lockRef = { current: false };
        let calls = 0;
        let lastError: string | null = 'erro-antigo';
        let releaseGate!: () => void;
        const gate = new Promise<void>((r) => {
            releaseGate = r;
        });

        const firstPromise = executeStartMatch({
            room: waitingRoom,
            lockRef,
            requestStart: async () => {
                calls += 1;
                await gate;
                return { id: waitingRoom.id, status: 'IN_PROGRESS' };
            },
            onError: (msg) => {
                lastError = msg;
            },
            onStarted: () => {},
        });

        const secondOk = await executeStartMatch({
            room: waitingRoom,
            lockRef,
            requestStart: async () => {
                calls += 1;
                return { id: waitingRoom.id, status: 'IN_PROGRESS' };
            },
            onError: () => {},
            onStarted: () => {},
        });

        assert.equal(secondOk, false);
        assert.equal(calls, 1);

        releaseGate();
        const firstOk = await firstPromise;
        assert.equal(firstOk, true);
        assert.equal(lastError, null);

        assert.match(formatStartMatchError(new ApiError('', 401)), /sessão expirou/i);
        assert.match(formatStartMatchError(new ApiError('', 500)), /falha no servidor/i);
        assert.match(formatStartMatchError(new Error('Failed to fetch')), /conectar ao servidor/i);
    });

    it('4. DashboardForm e useRoomsViewModel condicionam alerta à tentativa de início sem exibir summaryMessage ao abrir sala', () => {
        const dashboardSource = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../src/features/Dashboard/components/DashboardForm.tsx',
            ),
            'utf8',
        );
        const roomsVmSource = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../src/viewmodels/useRoomsViewModel.ts',
            ),
            'utf8',
        );

        assert.match(dashboardSource, /evaluateStartMatchRequirements/);
        assert.match(dashboardSource, /resolveStartMatchFeedback/);
        assert.match(dashboardSource, /shouldClearStartMatchFeedbackOnRequirementsMet/);
        assert.match(dashboardSource, /disabled=\{roomsVm\.isStartingMatch\}/);
        assert.doesNotMatch(dashboardSource, /startRequirements\.summaryMessage/);
        const feedbackOccurrences =
            dashboardSource.match(/\{startMatchFeedback\}/g) ?? [];
        assert.equal(feedbackOccurrences.length, 1);

        assert.match(roomsVmSource, /executeStartMatch/);
        assert.match(roomsVmSource, /hasAttemptedStart/);
        assert.match(roomsVmSource, /setStartMatchError\(message\)/);
        assert.match(roomsVmSource, /clearStartMatchFeedback/);
    });

    it('5. ciclo completo de UX: sem alerta ao abrir, alerta após clique incompleto, limpeza ao atender requisitos e exibição de erro da API', async () => {
        // 1. Ao abrir sala com requisitos incompletos: nenhum alerta aparece, mas checklist mostra quantidades e mínimos
        const incompleteEvaluation = evaluateStartMatchRequirements(1, 3);
        assert.equal(incompleteEvaluation.currentPlayers, 1);
        assert.equal(incompleteEvaluation.requiredPlayers, 2);
        assert.equal(incompleteEvaluation.currentQuestions, 3);
        assert.equal(incompleteEvaluation.requiredQuestions, 5);
        assert.equal(
            resolveStartMatchFeedback({
                hasAttemptedStart: false,
                startMatchError: null,
                startMatchErrorKind: null,
            }),
            null,
        );

        // 2. Ao clicar em iniciar com requisitos incompletos (409): alerta aparece
        let hasAttemptedStart = false;
        let startMatchError: string | null = null;
        let startMatchErrorKind: StartMatchErrorKind | null = null;
        const lockRef = { current: false };

        const server409Message =
            'Não é possível iniciar a partida: são necessários pelo menos 2 jogadores ativos (atual: 1) e pelo menos 5 perguntas ativas (atual: 3).';
        const originalFetch = globalThis.fetch;

        try {
            globalThis.fetch = (async () =>
                new Response(
                    JSON.stringify({
                        message: server409Message,
                        code: 'START_REQUIREMENTS_NOT_MET',
                    }),
                    {
                        status: 409,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )) as typeof fetch;

            const failedStart = await executeStartMatch({
                room: waitingRoom,
                lockRef,
                requestStart: startRoomApi,
                onAttemptStart: () => {
                    hasAttemptedStart = true;
                },
                onError: (msg, kind = null) => {
                    startMatchError = msg;
                    startMatchErrorKind = kind;
                },
                onStarted: () => {},
            });

            assert.equal(failedStart, false);
            assert.equal(hasAttemptedStart, true);
            assert.equal(startMatchErrorKind, 'requirements');
            assert.equal(
                resolveStartMatchFeedback({
                    hasAttemptedStart,
                    startMatchError,
                    startMatchErrorKind,
                }),
                server409Message,
            );
        } finally {
            globalThis.fetch = originalFetch;
        }

        // 3. Ao atender os requisitos (false -> true): alerta de pendência desaparece e partida inicia normalmente
        const readyEvaluation = evaluateStartMatchRequirements(2, 5);
        assert.equal(readyEvaluation.canStart, true);
        assert.equal(
            shouldClearStartMatchFeedbackOnRequirementsMet({
                previousCanStart: incompleteEvaluation.canStart,
                currentCanStart: readyEvaluation.canStart,
                startMatchErrorKind,
            }),
            true,
        );
        hasAttemptedStart = false;
        startMatchError = null;
        startMatchErrorKind = null;
        assert.equal(
            resolveStartMatchFeedback({
                hasAttemptedStart,
                startMatchError,
                startMatchErrorKind,
            }),
            null,
        );

        let startedSuccessfully = false;
        const ok = await executeStartMatch({
            room: waitingRoom,
            lockRef,
            requestStart: async () => ({ id: waitingRoom.id, status: 'IN_PROGRESS' }),
            onAttemptStart: () => {
                hasAttemptedStart = true;
            },
            onError: (msg, kind = null) => {
                startMatchError = msg;
                startMatchErrorKind = kind;
            },
            onStarted: () => {
                hasAttemptedStart = false;
                startedSuccessfully = true;
            },
        });
        assert.equal(ok, true);
        assert.equal(startedSuccessfully, true);
        assert.equal(startMatchError, null);

        // 4. Erro inesperado da API após tentativa (ex.: 500) deve continuar visível mesmo com requisitos completos
        const server500Error = new ApiError('Erro interno', 500);
        assert.equal(classifyStartMatchError(server500Error), 'api');
        const apiFailed = await executeStartMatch({
            room: waitingRoom,
            lockRef,
            requestStart: async () => {
                throw server500Error;
            },
            onAttemptStart: () => {
                hasAttemptedStart = true;
            },
            onError: (msg, kind = null) => {
                startMatchError = msg;
                startMatchErrorKind = kind;
            },
            onStarted: () => {},
        });
        assert.equal(apiFailed, false);
        assert.equal(startMatchErrorKind, 'api');
        assert.equal(
            shouldClearStartMatchFeedbackOnRequirementsMet({
                previousCanStart: false,
                currentCanStart: true,
                startMatchErrorKind,
            }),
            false,
        );
        assert.match(
            resolveStartMatchFeedback({
                hasAttemptedStart,
                startMatchError,
                startMatchErrorKind,
            }) ?? '',
            /falha no servidor/i,
        );
    });
});
