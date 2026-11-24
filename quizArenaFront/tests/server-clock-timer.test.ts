import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeRemainingSecondsFromDeadline,
    extractHostMatchRecoveryState,
} from '../src/models/room.ts';
import { apiRequest } from '../src/services/api.ts';
import type { ApiGameSummary } from '../src/services/roomStorageService.ts';
import {
    getServerClockSnapshot,
    getServerNowMs,
    isServerClockSynced,
    recordServerTimeSample,
    resetServerClock,
    subscribeServerClock,
} from '../src/services/serverClock.ts';
import { syncSocketClock } from '../src/services/socket.ts';

describe('Cronômetro sincronizado com servidor e contagem monotônica (Jogador e Anfitrião)', () => {
    const originalDateNow = Date.now;
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        Date.now = originalDateNow;
        globalThis.fetch = originalFetch;
        resetServerClock();
    });

    it('1. antes da sincronização não usa Date.now() e expõe ausência explícita de referência', () => {
        resetServerClock();

        assert.equal(isServerClockSynced(), false);
        assert.equal(getServerNowMs(1000), null);

        const expiresAt = '2026-11-24T12:00:30.000Z';
        const openedAt = '2026-11-24T12:00:00.000Z';

        assert.equal(
            computeRemainingSecondsFromDeadline(expiresAt, openedAt, 30),
            null,
        );

        const openGame: ApiGameSummary = {
            id: 'game-unsynced',
            status: 'IN_PROGRESS',
            maxPlayers: 10,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: '2026-11-24T11:59:00.000Z',
            finishedAt: null,
            createdAt: '2026-11-24T11:58:00.000Z',
            activeRound: {
                id: 'round-1',
                roundNumber: 1,
                status: 'OPEN',
                openedAt,
                expiresAt,
                timeLimit: 30,
                answeredCount: 0,
                eligiblePlayerCount: 2,
                answeredPlayers: [],
                question: {
                    id: 'q-1',
                    statement: 'Pergunta teste',
                    type: 'MULTIPLE_CHOICE',
                    position: 0,
                    options: [
                        { id: 'o-1', text: 'A', position: 0 },
                        { id: 'o-2', text: 'B', position: 1 },
                    ],
                },
            },
        };

        const hostRecovered = extractHostMatchRecoveryState(openGame);
        assert.equal(hostRecovered.activeRound?.id, 'round-1');
        assert.equal(hostRecovered.remainingSeconds, null);

        // UI do jogador e do anfitrião tratam null explicitamente sem travar alternativas
        const questionStepSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/QuestionStep.tsx'),
            'utf8',
        );
        const dashboardSrc = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../src/features/Dashboard/components/DashboardForm.tsx',
            ),
            'utf8',
        );
        assert.match(questionStepSrc, /isTimeSynced\s*=\s*remainingSeconds\s*!==\s*null/);
        assert.match(questionStepSrc, /isExpired\s*=\s*isTimeSynced\s*&&\s*remainingSeconds\s*<=\s*0/);
        assert.match(questionStepSrc, /Sincronizando/);
        assert.match(dashboardSrc, /roundRemainingSeconds\s*!==\s*null/);
    });

    it('2. mantém o mesmo tempo restante para jogadores e anfitrião mesmo com relógio local errado ou alterado durante a rodada', async () => {
        const serverStartMs = Date.parse('2026-11-24T12:00:00.000Z');
        const expiresAt = '2026-11-24T12:00:30.000Z';
        const openedAt = '2026-11-24T12:00:00.000Z';

        // Cliente A com relógio local +1 hora adiantado
        Date.now = () => serverStartMs + 3_600_000;
        let fakePerfNow = 10_000;
        const origPerfNow = globalThis.performance.now.bind(globalThis.performance);
        globalThis.performance.now = () => fakePerfNow;

        try {
            globalThis.fetch = (async () => {
                fakePerfNow += 20; // RTT de 20ms -> midpoint em 10_010
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Server-Time': String(serverStartMs + 10_000), // 10s após openedAt
                    },
                });
            }) as typeof fetch;

            await apiRequest('/rooms/ABC123', { auth: false });
            assert.equal(isServerClockSynced(), true);

            // Mesmo com Date.now() +1h, faltam 20s
            assert.equal(
                computeRemainingSecondsFromDeadline(expiresAt, openedAt, 30),
                20,
            );

            // Usuário altera o relógio do PC -2 horas no meio da pergunta
            Date.now = () => serverStartMs - 7_200_000;
            fakePerfNow += 5_000; // +5s monotônicos

            assert.equal(
                computeRemainingSecondsFromDeadline(expiresAt, openedAt, 30),
                15,
            );

            // Anfitrião (via extractHostMatchRecoveryState) com relógio diferente vê exatamente os mesmos 15s
            const hostRecovery = extractHostMatchRecoveryState({
                id: 'g-1',
                status: 'IN_PROGRESS',
                maxPlayers: 10,
                questionTime: 30,
                gameMode: 'CLASSIC',
                startedAt: openedAt,
                finishedAt: null,
                createdAt: openedAt,
                activeRound: {
                    id: 'r-1',
                    roundNumber: 1,
                    status: 'OPEN',
                    openedAt,
                    expiresAt,
                    timeLimit: 30,
                    answeredCount: 0,
                    eligiblePlayerCount: 2,
                    answeredPlayers: [],
                    question: {
                        id: 'q-1',
                        statement: 'Q1',
                        type: 'MULTIPLE_CHOICE',
                        position: 0,
                        options: [],
                    },
                },
            });
            assert.equal(hostRecovery.remainingSeconds, 15);
        } finally {
            globalThis.performance.now = origPerfNow;
        }
    });

    it('3. descarta amostras atrasadas, fora de ordem ou de RTT pior para não corromper âncora confiável', () => {
        const baseServerMs = Date.parse('2026-11-24T12:00:00.000Z');

        // Amostra confiável iniciada em t0=1000, RTT=20ms
        const acceptedFast = recordServerTimeSample({
            serverTimeMs: baseServerMs + 10,
            requestStartedPerfMs: 1000,
            requestCompletedPerfMs: 1020,
        });
        assert.equal(acceptedFast, true);
        const initialSnapshot = getServerClockSnapshot();
        assert.equal(initialSnapshot.bestRttMs, 20);

        // Resposta lenta posterior (RTT=450ms) com erro de assimetria não sobrescreve âncora de 20ms
        const rejectedSlow = recordServerTimeSample({
            serverTimeMs: baseServerMs + 300,
            requestStartedPerfMs: 1200,
            requestCompletedPerfMs: 1650,
        });
        assert.equal(rejectedSlow, false);
        assert.equal(getServerClockSnapshot().offsetMs, initialSnapshot.offsetMs);

        // Resposta atrasada fora de ordem (iniciada em t0=900, antes de 1000) é descartada
        const rejectedOutOfOrder = recordServerTimeSample({
            serverTimeMs: baseServerMs + 50,
            requestStartedPerfMs: 900,
            requestCompletedPerfMs: 1700,
        });
        assert.equal(rejectedOutOfOrder, false);
        assert.equal(getServerClockSnapshot().offsetMs, initialSnapshot.offsetMs);
    });

    it('4. recalibra após suspensão/retorno da aba quando performance.now() sofre pausa e notifica assinantes', async () => {
        const baseServerMs = Date.parse('2026-11-24T12:00:00.000Z');
        let perfNow = 5_000;
        let notifications = 0;
        const unsubscribe = subscribeServerClock(() => {
            notifications += 1;
        });

        try {
            recordServerTimeSample({
                serverTimeMs: baseServerMs,
                requestStartedPerfMs: 4_990,
                requestCompletedPerfMs: 5_010,
            });
            assert.equal(getServerNowMs(5_000), baseServerMs);

            // Simula dispositivo dormindo 15s enquanto performance.now() avançou apenas 1s
            perfNow = 6_000;
            const fakeSocket = {
                connected: true,
                emit: (
                    event: string,
                    cb: (payload: { serverTime: number }) => void,
                ) => {
                    assert.equal(event, 'time:sync');
                    perfNow += 30; // RTT 30ms -> midpoint em 6015
                    cb({ serverTime: baseServerMs + 15_015 });
                },
            };

            const synced = await syncSocketClock(fakeSocket, () => perfNow);
            assert.equal(synced, true);
            assert.equal(getServerNowMs(6_015), baseServerMs + 15_015);
            assert.equal(notifications, 2);
        } finally {
            unsubscribe();
        }
    });

    it('5. usePlayViewModel atualiza currentTimeLimit mesmo em reentrega da mesma rodada e ambos ViewModels reagem a visibilitychange', () => {
        const playVmSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );
        const hostVmSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );

        // applyRoundStarted deve atualizar setCurrentTimeLimit antes do retorno antecipado de mesma rodada
        const applyStartIdx = playVmSrc.indexOf('const applyRoundStarted');
        const sameRoundReturnIdx = playVmSrc.indexOf(
            'if (currentRoundIdRef.current === round.id)',
            applyStartIdx,
        );
        const setTimeLimitIdx = playVmSrc.indexOf(
            'setCurrentTimeLimit(round.timeLimit)',
            applyStartIdx,
        );
        assert.ok(applyStartIdx !== -1 && sameRoundReturnIdx !== -1 && setTimeLimitIdx !== -1);
        assert.ok(
            setTimeLimitIdx < sameRoundReturnIdx,
            'setCurrentTimeLimit deve executar antes do retorno antecipado quando a rodada já está ativa',
        );

        // Nenhum dos ViewModels usa Date.now() no cronômetro
        assert.doesNotMatch(playVmSrc, /Date\.now\(/);
        assert.doesNotMatch(hostVmSrc, /Date\.now\(/);

        // Ambos sincronizam via Socket.IO e tratam visibilitychange
        assert.match(playVmSrc, /syncSocketClock\(/);
        assert.match(playVmSrc, /subscribeServerClock\(/);
        assert.match(playVmSrc, /visibilitychange/);

        assert.match(hostVmSrc, /syncSocketClock\(/);
        assert.match(hostVmSrc, /subscribeServerClock\(/);
        assert.match(hostVmSrc, /visibilitychange/);
    });

    it('6. cronômetro do jogador continua ativo após chegar a zero e retoma contagem quando recalibração corrige para valor positivo', () => {
        const playVmSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );

        // Garante que o callback do setInterval no usePlayViewModel não chama clearInterval
        const timerMarker = '// Cronômetro visual monotônico durante a pergunta aberta';
        const timerStartIdx = playVmSrc.indexOf(timerMarker);
        assert.ok(timerStartIdx !== -1);
        const timerEndIdx = playVmSrc.indexOf('}, [phase, currentRoundId]);', timerStartIdx);
        assert.ok(timerEndIdx !== -1);
        const timerEffectSlice = playVmSrc.slice(timerStartIdx, timerEndIdx);

        const setIntervalStart = timerEffectSlice.indexOf('window.setInterval(');
        const setIntervalEnd = timerEffectSlice.indexOf('}, TIMER_TICK_MS);', setIntervalStart);
        assert.ok(setIntervalStart !== -1 && setIntervalEnd !== -1);
        const setIntervalCallback = timerEffectSlice.slice(setIntervalStart, setIntervalEnd);
        assert.doesNotMatch(setIntervalCallback, /clearInterval/);
        assert.match(timerEffectSlice.slice(setIntervalEnd), /window\.clearInterval\(intervalId\)/);

        // Simula o loop com setInterval real/simulado + subscribeServerClock com recalibração após atingir 0
        const openedAt = '2026-11-24T12:00:00.000Z';
        const expiresAt = '2026-11-24T12:00:30.000Z';
        const openedAtMs = Date.parse(openedAt);

        let fakePerfNow = 20_000;
        const origPerfNow = globalThis.performance.now.bind(globalThis.performance);
        globalThis.performance.now = () => fakePerfNow;

        let displayedRemaining: number | null = null;
        const updateVisualCountdown = () => {
            displayedRemaining = computeRemainingSecondsFromDeadline(expiresAt, openedAt, 30);
        };
        const activeIntervalCallback = () => {
            updateVisualCountdown();
        };
        const unsubscribe = subscribeServerClock(() => {
            updateVisualCountdown();
        });

        try {
            // Amostra inicial ruidosa indica que já expirou (32s após openedAt -> remaining = 0)
            recordServerTimeSample({
                serverTimeMs: openedAtMs + 32_000,
                requestStartedPerfMs: 12_000,
                requestCompletedPerfMs: 20_000,
            });
            updateVisualCountdown();
            assert.equal(displayedRemaining, 0);

            // Mesmo com ticks subsequentes em 0, o intervalo continua ativo
            fakePerfNow += 200;
            activeIntervalCallback();
            assert.equal(displayedRemaining, 0);

            // Recalibração rápida conclui em t1=20_220 corrigindo para 18s decorridos (12s restantes)
            fakePerfNow = 20_220;
            const recalibrated = recordServerTimeSample({
                serverTimeMs: openedAtMs + 18_000,
                requestStartedPerfMs: 20_200,
                requestCompletedPerfMs: 20_220,
            });
            assert.equal(recalibrated, true);
            assert.equal(displayedRemaining, 12);

            // Ticks seguintes do mesmo intervalo continuam decrementando normalmente: 12 -> 11 -> 10
            fakePerfNow = 21_220;
            activeIntervalCallback();
            assert.equal(displayedRemaining, 11);

            fakePerfNow = 22_220;
            activeIntervalCallback();
            assert.equal(displayedRemaining, 10);
        } finally {
            unsubscribe();
            globalThis.performance.now = origPerfNow;
        }
    });

    it('7. aceita recuperação após suspensão com RTT ~1.800ms, rejeita lenta sem suspensão/RTT > 5.000ms e refina com amostra rápida posterior', async () => {
        const baseServerMs = Date.parse('2026-11-24T12:00:00.000Z');

        // Âncora inicial limpa: RTT=20ms em t0=1000..t1=1020 (midpoint 1010 -> offset = baseServerMs - 1010)
        assert.equal(
            recordServerTimeSample({
                serverTimeMs: baseServerMs,
                requestStartedPerfMs: 1_000,
                requestCompletedPerfMs: 1_020,
            }),
            true,
        );

        // A) Amostra lenta (~1.800ms) SEM evidência de suspensão (drift dentro do erro de RTT): rejeitada
        const rejectedSlowWithoutSuspend = recordServerTimeSample({
            serverTimeMs: baseServerMs + 1_200, // servidor respondeu no início de [2000, 3800]
            requestStartedPerfMs: 2_000,
            requestCompletedPerfMs: 3_800,
        });
        assert.equal(rejectedSlowWithoutSuspend, false);
        assert.equal(getServerClockSnapshot().bestRttMs, 20);

        // B) Amostra de recuperação com RTT=1.800ms COM evidência consistente de suspensão (drift=15.000ms): aceita
        const acceptedSlowRecovery = recordServerTimeSample({
            serverTimeMs: baseServerMs + 18_000,
            requestStartedPerfMs: 4_000,
            requestCompletedPerfMs: 5_800,
        });
        assert.equal(acceptedSlowRecovery, true);
        assert.equal(getServerClockSnapshot().bestRttMs, 1_800);

        // C) Amostra com RTT excessivo (> 5.000ms) mesmo com drift grande: rejeitada
        const rejectedExcessiveRtt = recordServerTimeSample({
            serverTimeMs: baseServerMs + 35_000,
            requestStartedPerfMs: 6_000,
            requestCompletedPerfMs: 11_500, // RTT=5.500ms > 5.000ms
        });
        assert.equal(rejectedExcessiveRtt, false);
        assert.equal(getServerClockSnapshot().bestRttMs, 1_800);

        // D) Amostra rápida posterior (RTT=25ms) refina a referência após recuperação lenta
        const refinedFast = recordServerTimeSample({
            serverTimeMs: baseServerMs + 19_200,
            requestStartedPerfMs: 6_100,
            requestCompletedPerfMs: 6_125,
        });
        assert.equal(refinedFast, true);
        assert.equal(getServerClockSnapshot().bestRttMs, 25);

        // E) Intercalação fora de ordem entre HTTP lento (apiRequest) e Socket.IO rápido (syncSocketClock)
        let perfNow = 10_000;
        const origPerfNow = globalThis.performance.now.bind(globalThis.performance);
        globalThis.performance.now = () => perfNow;
        try {
            let resolveSlowHttp!: (res: Response) => void;
            globalThis.fetch = (() =>
                new Promise<Response>((resolve) => {
                    resolveSlowHttp = resolve;
                })) as typeof fetch;

            const slowHttpPromise = apiRequest('/rooms/ABC123', { auth: false });

            // Enquanto HTTP ainda está em voo (t0=10000), Socket.IO inicia depois (t0=10050) e responde rápido
            perfNow = 10_050;
            await syncSocketClock(
                {
                    connected: true,
                    emit: (_ev, cb) => {
                        perfNow += 20; // t1=10070, midpoint=10060
                        cb({ serverTime: baseServerMs + 23_135 });
                    },
                },
                () => perfNow,
            );
            const offsetAfterSocket = getServerClockSnapshot().offsetMs;

            // HTTP antigo finalmente retorna depois (t1=11500, com serverTime enviesado): deve ser rejeitado
            perfNow = 11_500;
            resolveSlowHttp(
                new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Server-Time': String(baseServerMs + 28_000),
                    },
                }),
            );
            await slowHttpPromise;
            assert.equal(getServerClockSnapshot().offsetMs, offsetAfterSocket);
        } finally {
            globalThis.performance.now = origPerfNow;
        }
    });
});
