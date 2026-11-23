import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    executeRecoverPlayerSession,
    shouldClearPlayerSessionOnError,
} from '../src/models/game.ts';
import { ApiError } from '../src/services/api.ts';
import {
    PLAYER_SESSION_STORAGE_KEY,
    clearPlayerSession,
    loadPlayerSession,
    savePlayerSession,
} from '../src/services/playerSessionStorage.ts';

function createMemoryStorage() {
    const store = new Map<string, string>();
    return {
        store,
        adapter: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
            removeItem: (key: string) => {
                store.delete(key);
            },
        },
    };
}

describe('Etapa 3 — Persistência e Recuperação de Sessão do Jogador (Frontend)', () => {
    const sampleSession = {
        sessionToken: 'player-secret-token-123',
        roomCode: 'abc123',
        roomId: 'room-uuid-1',
        gameId: 'game-uuid-1',
        playerId: 'player-uuid-1',
        nickname: 'Alice',
    };

    it('1. salva, carrega e limpa a sessão exclusivamente via adapter sessionStorage normalizando roomCode e limpando dados corrompidos', () => {
        const memory = createMemoryStorage();

        const saved = savePlayerSession(sampleSession, memory.adapter);
        assert.equal(saved, true);
        assert.equal(
            memory.store.has(PLAYER_SESSION_STORAGE_KEY),
            true,
        );

        const loaded = loadPlayerSession(memory.adapter);
        assert.deepEqual(loaded, {
            ...sampleSession,
            roomCode: 'ABC123',
        });

        // Entrada corrompida é limpa automaticamente sem lançar exceção
        memory.adapter.setItem(PLAYER_SESSION_STORAGE_KEY, '{json-invalido');
        assert.equal(loadPlayerSession(memory.adapter), null);
        assert.equal(memory.store.has(PLAYER_SESSION_STORAGE_KEY), false);

        // Entrada incompleta ou código inválido também é descartada
        memory.adapter.setItem(
            PLAYER_SESSION_STORAGE_KEY,
            JSON.stringify({ sessionToken: 'tok', roomCode: '12', nickname: 'Ana' }),
        );
        assert.equal(loadPlayerSession(memory.adapter), null);
        assert.equal(memory.store.has(PLAYER_SESSION_STORAGE_KEY), false);

        // Limpeza explícita (ex.: saída voluntária)
        savePlayerSession(sampleSession, memory.adapter);
        clearPlayerSession(memory.adapter);
        assert.equal(loadPlayerSession(memory.adapter), null);
    });

    it('2. executeRecoverPlayerSession valida sessão no backend de forma idempotente, sem chamar novo joinRoom nem duplicar requisições', async () => {
        const lockRef = { current: false };
        const recoveringStates: boolean[] = [];
        let recoveredCount = 0;
        let invalidatedCount = 0;
        let fetchCalls = 0;
        let resolveFetch!: (value: {
            id: string;
            code: string;
            roomStatus: string;
            currentGame: { id: string; status: string };
        }) => void;

        const firstPromise = executeRecoverPlayerSession({
            persistedSession: { ...sampleSession, roomCode: 'ABC123' },
            lockRef,
            fetchLobby: () => {
                fetchCalls += 1;
                return new Promise<{
                    id: string;
                    code: string;
                    roomStatus: string;
                    currentGame: { id: string; status: string };
                }>((resolve) => {
                    resolveFetch = resolve;
                });
            },
            setIsRecovering: (v) => recoveringStates.push(v),
            setError: () => {},
            onRecovered: () => {
                recoveredCount += 1;
            },
            onSessionInvalid: () => {
                invalidatedCount += 1;
            },
        });

        const secondAttempt = await executeRecoverPlayerSession({
            persistedSession: { ...sampleSession, roomCode: 'ABC123' },
            lockRef,
            fetchLobby: async () => {
                fetchCalls += 1;
                return {
                    id: 'room-uuid-1',
                    code: 'ABC123',
                    roomStatus: 'ACTIVE',
                    currentGame: { id: 'game-uuid-1', status: 'WAITING' },
                };
            },
            setIsRecovering: () => {},
            setError: () => {},
            onRecovered: () => {
                recoveredCount += 1;
            },
            onSessionInvalid: () => {
                invalidatedCount += 1;
            },
        });

        assert.equal(secondAttempt, 'skipped');
        assert.equal(fetchCalls, 1);

        resolveFetch({
            id: 'room-uuid-1',
            code: 'ABC123',
            roomStatus: 'ACTIVE',
            currentGame: { id: 'game-uuid-1', status: 'WAITING' },
        });

        const firstResult = await firstPromise;
        assert.equal(firstResult, 'recovered');
        assert.equal(recoveredCount, 1);
        assert.equal(invalidatedCount, 0);
        assert.deepEqual(recoveringStates, [true, false]);
    });

    it('3. limpa sessão e invalida quando backend retorna 401 (LEFT/expirado), 403 (nova partida), 404 ou 409, ou quando gameId diverge', async () => {
        for (const status of [401, 403, 404, 409]) {
            assert.equal(shouldClearPlayerSessionOnError(new ApiError('Erro', status)), true);

            const lockRef = { current: false };
            let invalidated = false;
            const result = await executeRecoverPlayerSession({
                persistedSession: { ...sampleSession, roomCode: 'ABC123' },
                lockRef,
                fetchLobby: async () => {
                    throw new ApiError('Sessão inválida', status);
                },
                setIsRecovering: () => {},
                setError: () => {},
                onRecovered: () => {},
                onSessionInvalid: () => {
                    invalidated = true;
                },
            });

            assert.equal(result, 'invalid');
            assert.equal(invalidated, true);
        }

        // Divergência de gameId (ex.: host criou replay) também invalida sem redirecionar para novo join
        const mismatchLock = { current: false };
        let mismatchInvalidated = false;
        const mismatchRes = await executeRecoverPlayerSession({
            persistedSession: { ...sampleSession, roomCode: 'ABC123' },
            lockRef: mismatchLock,
            fetchLobby: async () => ({
                id: 'room-uuid-1',
                code: 'ABC123',
                roomStatus: 'ACTIVE',
                currentGame: { id: 'game-uuid-2', status: 'WAITING' },
            }),
            setIsRecovering: () => {},
            setError: () => {},
            onRecovered: () => {},
            onSessionInvalid: () => {
                mismatchInvalidated = true;
            },
        });
        assert.equal(mismatchRes, 'invalid');
        assert.equal(mismatchInvalidated, true);
    });

    it('4. falha transiente de rede ou 500 não entra em loop e expõe erro sem descartar sessão nem chamar joinRoom', async () => {
        assert.equal(shouldClearPlayerSessionOnError(new ApiError('Erro interno', 500)), false);

        const lockRef = { current: false };
        let invalidated = false;
        let errorMessage: string | null = null;

        const result = await executeRecoverPlayerSession({
            persistedSession: { ...sampleSession, roomCode: 'ABC123' },
            lockRef,
            fetchLobby: async () => {
                throw new ApiError('Servidor indisponível.', 503);
            },
            setIsRecovering: () => {},
            setError: (msg) => {
                errorMessage = msg;
            },
            onRecovered: () => {},
            onSessionInvalid: () => {
                invalidated = true;
            },
        });

        assert.equal(result, 'error');
        assert.equal(invalidated, false);
        assert.equal(errorMessage, 'Servidor indisponível.');
        assert.equal(lockRef.current, false);
    });

    it('5. usePlayViewModel persiste no sessionStorage após entrada, recupera WAITING/IN_PROGRESS/FINISHED/CANCELLED, evita listeners duplicados e limpa ao sair', () => {
        const playVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );
        const playViewSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.tsx'),
            'utf8',
        );

        // Persistência exclusivamente via playerSessionStorage (sem localStorage)
        assert.doesNotMatch(playVmSource, /localStorage/);
        assert.match(playVmSource, /savePlayerSession\(/);
        assert.match(playVmSource, /loadPlayerSession\(/);
        assert.match(playVmSource, /clearPlayerSession\(/);

        // Recuperação idempotente na montagem antes do Socket.IO
        assert.match(playVmSource, /executeRecoverPlayerSession\(/);
        assert.match(playVmSource, /canConnectSocket/);
        assert.match(playVmSource, /isLiveMatch = status === 'WAITING' \|\| status === 'IN_PROGRESS'/);

        // Estados: WAITING, IN_PROGRESS (com answeredPlayers & expiresAt) e FINISHED/CANCELLED
        assert.match(playVmSource, /cg\.status === 'WAITING'/);
        assert.match(playVmSource, /cg\.status === 'IN_PROGRESS'/);
        assert.match(playVmSource, /cg\.activeRound\.answeredPlayers\?\.some/);
        assert.match(playVmSource, /cg\.status === 'FINISHED' \|\| cg\.status === 'CANCELLED'/);

        // Limpeza de listeners e socket ao desmontar / encerrar / limpar sessão
        assert.match(playVmSource, /socket\.removeAllListeners\(\)/);
        assert.match(playVmSource, /socket\.disconnect\(\)/);
        assert.match(playVmSource, /resetToJoin = useCallback\(\(\) => \{\s*clearPlayerSession\(\)/);
        assert.match(playVmSource, /navigate\('\/', \{ replace: true \}\)/);

        // PlayView exibe estado intermediário enquanto recupera sessão para não piscar JoinStep
        assert.match(playViewSource, /viewModel\.isRecovering/);
    });
});
