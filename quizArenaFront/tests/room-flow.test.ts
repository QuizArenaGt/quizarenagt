import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_ROOM_CODE_INPUT_LENGTH,
    PIN_LENGTH,
    buildPlayRouteWithPin,
    executeRecoverPlayerSession,
    executeVerifyRoomCode,
    formatRoomAvailabilityError,
    isValidRoomCode,
    mapLobbyToPlayerGameRoom,
    normalizeRoomCode,
    normalizeRoomCodeInput,
    sanitizePin,
    validateRoomCode,
    type PlayPhase,
} from '../src/models/game.ts';
import {
    deduplicateRoomsById,
    executeLoadHostRooms,
    executeLoadRoomByCode,
    executeSubmitRoom,
    formatNullableDateTime,
    formatRoomCode,
    getClipboardRoomCode,
    upsertRoomInList,
    type HostSessionTracker,
    type Room,
} from '../src/models/room.ts';
import { ApiError } from '../src/services/api.ts';
import {
    joinRoomWithNickname,
    verifyRoomAvailability,
} from '../src/services/gameRoomService.ts';
import {
    createRoomApi,
    isValidApiRoom,
    listHostRoomsApi,
    mapApiRoomToModel,
    updateRoomApi,
    type ApiHostRoom,
    type ApiRoom,
    type ApiRoomLobby,
} from '../src/services/roomStorageService.ts';

describe('BUG 06 — Normalização, cópia e validação do código da sala', () => {
    it('deve definir limite razoável de 15 caracteres para inputs de código', () => {
        assert.equal(MAX_ROOM_CODE_INPUT_LENGTH, 15);
    });

    it('deve aceitar e normalizar códigos válidos com espaços externos, internos e minúsculas', () => {
        const validScenarios = [
            { input: 'ABC123', expected: 'ABC123' },
            { input: ' ABC123 ', expected: 'ABC123' },
            { input: 'ABC 123', expected: 'ABC123' },
            { input: 'abc123', expected: 'ABC123' },
            { input: '  ab c 12 3  ', expected: 'ABC123' },
        ];

        for (const { input, expected } of validScenarios) {
            assert.equal(normalizeRoomCode(input), expected);
            assert.equal(sanitizePin(input), expected);
            assert.equal(isValidRoomCode(input), true);
            assert.equal(validateRoomCode(input), null);
            assert.equal(getClipboardRoomCode(input), expected);
        }
    });

    it('deve rejeitar códigos com tamanho inválido, caracteres especiais ou vazios', () => {
        const invalidScenarios = ['ABC12', 'ABC1234', 'ABC@23', '', '   '];

        for (const input of invalidScenarios) {
            assert.equal(isValidRoomCode(input), false);
            assert.notEqual(validateRoomCode(input), null);
        }
    });

    it('deve manter formatação visual com espaço, mas copiar exclusivamente os 6 caracteres normalizados', () => {
        const formatted = formatRoomCode('abc123');
        assert.equal(formatted, 'ABC 123');
        assert.equal(getClipboardRoomCode(formatted), 'ABC123');
    });

    it('deve normalizar, validar e codificar o código na navegação da Landing Page', () => {
        assert.equal(buildPlayRouteWithPin(' abc 123 '), '/jogar?codigo=ABC123');
        assert.equal(buildPlayRouteWithPin('ABC12'), '/jogar');
        assert.equal(buildPlayRouteWithPin('ABC@23'), '/jogar');
        assert.equal(buildPlayRouteWithPin('   '), '/jogar');
    });

    it('loadRoomByCode não deve chamar a API quando o código for inválido', async () => {
        let apiCalls = 0;
        let capturedError: string | null = null;

        for (const invalidCode of ['', '   ', 'ABC12', 'ABC1234', 'ABC@23']) {
            const result = await executeLoadRoomByCode({
                code: invalidCode,
                fetchLobby: async () => {
                    apiCalls += 1;
                    return {} as ApiRoomLobby;
                },
                onError: (err) => {
                    capturedError = err;
                },
                onSuccess: () => ({}) as Room,
            });

            assert.equal(result, null);
            assert.notEqual(capturedError, null);
        }

        assert.equal(apiCalls, 0);
    });

    it('loadRoomByCode deve normalizar o código antes de chamar a API quando for válido', async () => {
        let receivedCode = '';
        let capturedError: string | null = null;

        const mockLobby: ApiRoomLobby = {
            id: 'room-1',
            code: 'ABC123',
            status: 'WAITING',
            gameMode: 'CLASSIC',
            maxPlayers: 10,
            questionTime: 30,
            createdAt: new Date().toISOString(),
            host: { id: 'host-1', name: 'Prof' },
            players: [],
            playerCount: 0,
        };

        const result = await executeLoadRoomByCode({
            code: '  abc 123 ',
            fetchLobby: async (cleanCode) => {
                receivedCode = cleanCode;
                return mockLobby;
            },
            onError: (err) => {
                capturedError = err;
            },
            onSuccess: (lobby) => mapApiRoomToModel(lobby),
        });

        assert.equal(receivedCode, 'ABC123');
        assert.equal(capturedError, null);
        assert.equal(result?.code, 'ABC123');
    });

    it('campos de código devem aceitar no máximo 6 caracteres úteis após normalizar espaços e maiúsculas', () => {
        assert.equal(PIN_LENGTH, 6);

        // 1. Digitação normal de 6 caracteres e conversão de minúsculas
        let inputState = '';
        for (const char of ['a', 'b', 'c', '1', '2', '3']) {
            inputState = normalizeRoomCodeInput(inputState + char);
        }
        assert.equal(inputState, 'ABC123');
        assert.equal(inputState.length, 6);

        // 2. Tentativa de digitar um sétimo caractere não altera o estado de 6 caracteres
        inputState = normalizeRoomCodeInput(inputState + 'X');
        assert.equal(inputState, 'ABC123');
        assert.equal(inputState.length, 6);

        // 3. Digitação de espaços durante o preenchimento é ignorada sem exigir espaços
        assert.equal(normalizeRoomCodeInput('ab c '), 'ABC');

        // 4. Colagem de 'ABC 123' resulta em 'ABC123'
        assert.equal(normalizeRoomCodeInput('ABC 123'), 'ABC123');

        // 5. Colagem de 'ABC123EXTRA' resulta em 'ABC123' sem ultrapassar 6 caracteres
        assert.equal(normalizeRoomCodeInput('ABC123EXTRA'), 'ABC123');

        // 6. Colagem de texto com espaços no início, meio e fim e letras minúsculas
        assert.equal(normalizeRoomCodeInput('   ab c 123   '), 'ABC123');
        assert.equal(normalizeRoomCodeInput('   ab c 123 extra  '), 'ABC123');
    });
});

describe('BUG 08 — Criação de sala, tratamento imediato de erros e proteção contra duplo envio', () => {
    const validFormInput = {
        name: 'Sala de Algoritmos',
        theme: 'Computação',
        maxPlayers: 15,
        timeLimit: 30,
        gameMode: 'CLASSIC' as const,
    };

    const validApiRoom: ApiRoom = {
        id: 'room-uuid-123',
        code: '9TFP41',
        hostId: 'host-uuid-1',
        maxPlayers: 15,
        questionTime: 30,
        gameMode: 'CLASSIC',
        status: 'WAITING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    it('submitRoom em caso de sucesso deve criar a sala, navegar e fechar o modal', async () => {
        const lockRef = { current: false };
        const submittingStates: boolean[] = [];
        let errorMessage: string | null = 'erro-anterior';
        let createdRoom: Room | null = null;
        let isModalOpen = true;

        const ok = await executeSubmitRoom({
            input: validFormInput,
            lockRef,
            onSubmittingChange: (state) => submittingStates.push(state),
            onError: (msg) => {
                errorMessage = msg;
            },
            executeRequest: async () => validApiRoom,
            onSuccess: (apiRoom, input) => {
                createdRoom = mapApiRoomToModel(apiRoom, {
                    name: input.name,
                    theme: input.theme,
                });
                isModalOpen = false;
            },
        });

        assert.equal(ok, true);
        assert.equal(errorMessage, null);
        assert.equal(isModalOpen, false);
        assert.equal((createdRoom as Room | null)?.code, '9TFP41');
        assert.deepEqual(submittingStates, [true, false]);
        assert.equal(lockRef.current, false);
    });

    it('submitRoom em caso de erro HTTP (400 e 500) deve permanecer no modal e exibir erro imediato', async () => {
        const lockRef = { current: false };
        let errorMessage: string | null = null;
        let navigated = false;

        // Caso 1: Erro HTTP 400 com mensagem de campo
        const ok400 = await executeSubmitRoom({
            input: validFormInput,
            lockRef,
            onError: (msg) => {
                errorMessage = msg;
            },
            executeRequest: async () => {
                throw new ApiError('Dados inválidos.', 400, {
                    maxPlayers: 'A quantidade de jogadores deve ser um número inteiro entre 2 e 50.',
                });
            },
            onSuccess: () => {
                navigated = true;
            },
        });

        assert.equal(ok400, false);
        assert.equal(navigated, false);
        assert.equal(
            errorMessage,
            'A quantidade de jogadores deve ser um número inteiro entre 2 e 50.',
        );
        assert.equal(lockRef.current, false);

        // Caso 2: Erro HTTP 500 ocultando detalhes internos do banco
        const ok500 = await executeSubmitRoom({
            input: validFormInput,
            lockRef,
            onError: (msg) => {
                errorMessage = msg;
            },
            executeRequest: async () => {
                throw new ApiError('Prisma error P2002 internal stack', 500);
            },
            onSuccess: () => {
                navigated = true;
            },
        });

        assert.equal(ok500, false);
        assert.equal(navigated, false);
        assert.equal(
            errorMessage,
            'Não foi possível criar a sala devido a uma falha no servidor. Tente novamente em instantes.',
        );
        assert.equal(lockRef.current, false);
    });

    it('submitRoom em caso de falha de rede deve impedir navegação e informar erro de conexão', async () => {
        const lockRef = { current: false };
        let errorMessage: string | null = null;
        let navigated = false;

        const ok = await executeSubmitRoom({
            input: validFormInput,
            lockRef,
            onError: (msg) => {
                errorMessage = msg;
            },
            executeRequest: async () => {
                throw new Error('Failed to fetch');
            },
            onSuccess: () => {
                navigated = true;
            },
        });

        assert.equal(ok, false);
        assert.equal(navigated, false);
        assert.equal(
            errorMessage,
            'Não foi possível conectar ao servidor. Verifique sua conexão.',
        );
        assert.equal(lockRef.current, false);
    });

    it('submitRoom deve bloquear duplo envio simultâneo e restaurar o botão ao finalizar', async () => {
        const lockRef = { current: false };
        let apiCalls = 0;
        let successCount = 0;

        const triggerSubmit = () =>
            executeSubmitRoom({
                input: validFormInput,
                lockRef,
                onError: () => {},
                executeRequest: async () => {
                    apiCalls += 1;
                    await new Promise((resolve) => setTimeout(resolve, 25));
                    return validApiRoom;
                },
                onSuccess: () => {
                    successCount += 1;
                },
            });

        const [firstResult, secondResult] = await Promise.all([
            triggerSubmit(),
            triggerSubmit(),
        ]);

        assert.equal(firstResult, true);
        assert.equal(secondResult, false);
        assert.equal(apiCalls, 1);
        assert.equal(successCount, 1);
        assert.equal(lockRef.current, false);
    });

    it('createRoomApi deve rejeitar respostas 2xx malformadas sem criar sala inválida', async () => {
        assert.equal(isValidApiRoom(validApiRoom), true);
        assert.equal(isValidApiRoom(null), false);
        assert.equal(isValidApiRoom({ status: 'ok' }), false);

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ status: 'ok' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })) as typeof fetch;

        try {
            await assert.rejects(
                () =>
                    createRoomApi({
                        maxPlayers: 10,
                        questionTime: 30,
                        gameMode: 'CLASSIC',
                    }),
                /Resposta inválida ao criar sala/,
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('Melhoria UX — Validar existência e disponibilidade da sala antes de solicitar o apelido', () => {
    it('1. Código válido e sala existente: deve normalizar, consultar backend e avançar/navegar', async () => {
        let navigatedRoute: string | null = null;
        let phase: PlayPhase = 'join';
        let error: string | null = 'erro-anterior';
        let normalizedPin = '';
        const loadingStates: boolean[] = [];

        // Fluxo Landing Page
        const landingSuccess = await executeVerifyRoomCode({
            rawCode: ' abc 123 ',
            lockRef: { current: false },
            checkAvailability: async (code) => ({
                code,
                available: true,
            }),
            setIsLoading: (loading) => loadingStates.push(loading),
            setError: (err) => {
                error = err;
            },
            onSuccess: (cleanPin) => {
                navigatedRoute = buildPlayRouteWithPin(cleanPin, '/jogar');
            },
        });

        assert.equal(landingSuccess, true);
        assert.equal(error, null);
        assert.equal(navigatedRoute, '/jogar?codigo=ABC123');
        assert.deepEqual(loadingStates, [true, false]);

        // Fluxo /jogar -> avança para 'nickname' apenas após confirmação
        const playSuccess = await executeVerifyRoomCode({
            rawCode: ' abc 123 ',
            lockRef: { current: false },
            checkAvailability: async (code) => ({
                code,
                available: true,
            }),
            setIsLoading: () => {},
            setError: (err) => {
                error = err;
            },
            onNormalizedCode: (code) => {
                normalizedPin = code;
            },
            onSuccess: () => {
                phase = 'nickname';
            },
        });

        assert.equal(playSuccess, true);
        assert.equal(normalizedPin, 'ABC123');
        assert.equal(phase, 'nickname');
    });

    it('2, 7 e 8. Código válido e sala inexistente (Landing Page e acesso direto a /jogar): deve exibir erro imediato sem navegar nem pedir apelido', async () => {
        let navigatedToPlay = false;
        let landingError: string | null = null;

        // 8. Entrada pela Landing Page com código inexistente
        const landingResult = await executeVerifyRoomCode({
            rawCode: 'XYZ999',
            lockRef: { current: false },
            checkAvailability: async () => {
                throw new ApiError(
                    'Sala não encontrada. Verifique o código informado.',
                    404,
                );
            },
            setIsLoading: () => {},
            setError: (err) => {
                landingError = err;
            },
            onSuccess: () => {
                navigatedToPlay = true;
            },
        });

        assert.equal(landingResult, false);
        assert.equal(navigatedToPlay, false);
        assert.equal(
            landingError,
            'Sala não encontrada. Verifique o código informado.',
        );

        // 7. Acesso direto a /jogar com código inexistente
        let playPhase: PlayPhase = 'join';
        let playError: string | null = null;

        const playResult = await executeVerifyRoomCode({
            rawCode: 'XYZ999',
            lockRef: { current: false },
            checkAvailability: async () => {
                throw new ApiError('Sala não encontrada.', 404);
            },
            setIsLoading: () => {},
            setError: (err) => {
                playError = err;
            },
            onSuccess: () => {
                playPhase = 'nickname';
            },
        });

        assert.equal(playResult, false);
        assert.equal(playPhase, 'join');
        assert.equal(
            playError,
            'Sala não encontrada. Verifique o código informado.',
        );
    });

    it('3. Código com formato inválido: deve exibir erro imediato e não fazer requisição HTTP', async () => {
        let apiCalls = 0;
        let phase: PlayPhase = 'join';
        let error = null as string | null;

        for (const invalidCode of ['', '   ', 'AB12', 'ABC@23', 'ABC1234']) {
            const result = await executeVerifyRoomCode({
                rawCode: invalidCode,
                lockRef: { current: false },
                checkAvailability: async (code) => {
                    apiCalls += 1;
                    return { code, available: true };
                },
                setIsLoading: () => {},
                setError: (err) => {
                    error = err;
                },
                onSuccess: () => {
                    phase = 'nickname';
                },
            });

            assert.equal(result, false);
            assert.equal(phase, 'join');
            assert.notEqual(error, null);
        }

        assert.equal(apiCalls, 0);
    });

    it('4 e 5. Sala lotada, encerrada, cancelada ou em andamento: deve diferenciar cenários e impedir avanço para apelido', async () => {
        const scenarios = [
            {
                error: new ApiError('Esta sala atingiu o limite de jogadores.', 409),
                expected: 'Esta sala atingiu o limite de jogadores.',
            },
            {
                error: new ApiError('Esta sala já foi encerrada.', 409),
                expected: 'Esta sala já foi encerrada.',
            },
            {
                error: new ApiError('Esta sala foi cancelada.', 409),
                expected: 'Esta sala foi cancelada.',
            },
            {
                error: new ApiError(
                    'Esta partida já está em andamento e não aceita novos jogadores.',
                    409,
                ),
                expected:
                    'Esta partida já está em andamento e não aceita novos jogadores.',
            },
        ];

        for (const scenario of scenarios) {
            let phase: PlayPhase = 'join';
            let capturedError: string | null = null;

            const result = await executeVerifyRoomCode({
                rawCode: 'ABC123',
                lockRef: { current: false },
                checkAvailability: async () => {
                    throw scenario.error;
                },
                setIsLoading: () => {},
                setError: (err) => {
                    capturedError = err;
                },
                onSuccess: () => {
                    phase = 'nickname';
                },
            });

            assert.equal(result, false);
            assert.equal(phase, 'join');
            assert.equal(capturedError, scenario.expected);
        }
    });

    it('6. Falha de conexão: não deve confundir erro de rede com sala inexistente', async () => {
        let phase: PlayPhase = 'join';
        let capturedError = null as string | null;

        const result = await executeVerifyRoomCode({
            rawCode: 'ABC123',
            lockRef: { current: false },
            checkAvailability: async () => {
                throw new Error('TypeError: Failed to fetch');
            },
            setIsLoading: () => {},
            setError: (err) => {
                capturedError = err;
            },
            onSuccess: () => {
                phase = 'nickname';
            },
        });

        assert.equal(result, false);
        assert.equal(phase, 'join');
        assert.equal(
            capturedError,
            'Não foi possível conectar ao servidor. Verifique sua conexão.',
        );
        assert.equal(String(capturedError).includes('Sala não encontrada'), false);
    });

    it('9. Confirmação de que o apelido não é solicitado enquanto a validação estiver pendente e bloqueio contra consultas simultâneas', async () => {
        const lockRef = { current: false };
        let apiCalls = 0;
        let phase: PlayPhase = 'join';
        let resolveCheck!: (value: { code: string; available: boolean }) => void;

        const checkPromise = new Promise<{ code: string; available: boolean }>(
            (resolve) => {
                resolveCheck = resolve;
            },
        );

        const triggerVerify = () =>
            executeVerifyRoomCode({
                rawCode: 'ABC123',
                lockRef,
                checkAvailability: () => {
                    apiCalls += 1;
                    return checkPromise;
                },
                setIsLoading: () => {},
                setError: () => {},
                onSuccess: () => {
                    phase = 'nickname';
                },
            });

        const firstAttempt = triggerVerify();
        const secondAttempt = triggerVerify();

        // Enquanto a validação estiver pendente, a etapa permanece em 'join' (apelido não é solicitado)
        assert.equal(phase, 'join');
        assert.equal(await secondAttempt, false);
        assert.equal(apiCalls, 1);

        resolveCheck({ code: 'ABC123', available: true });
        assert.equal(await firstAttempt, true);
        assert.equal(phase, 'nickname');
        assert.equal(lockRef.current, false);
    });

    it('10. Integração com endpoints: verifyRoomAvailability e validação definitiva em joinRoomWithNickname', async () => {
        const originalFetch = globalThis.fetch;
        const calledUrls: string[] = [];

        try {
            // 10a. Consulta pública GET /rooms/:code/availability
            globalThis.fetch = (async (input: RequestInfo | URL) => {
                calledUrls.push(String(input));
                return new Response(
                    JSON.stringify({
                        room: {
                            code: 'ABC123',
                            status: 'WAITING',
                            available: true,
                        },
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                );
            }) as typeof fetch;

            const availability = await verifyRoomAvailability(' abc 123 ');
            assert.equal(availability.available, true);
            assert.equal(availability.code, 'ABC123');
            assert.ok(calledUrls[0].endsWith('/rooms/ABC123/availability'));

            // 10b. Se a sala lotar ou encerrar entre a consulta inicial e o envio do apelido,
            // POST /rooms/join rejeita definitivamente no backend
            globalThis.fetch = (async () =>
                new Response(
                    JSON.stringify({
                        message: 'Esta sala atingiu o limite de jogadores.',
                    }),
                    {
                        status: 409,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )) as typeof fetch;

            await assert.rejects(
                () => joinRoomWithNickname('ABC123', 'Jogador1'),
                (err: unknown) => {
                    assert.equal(
                        formatRoomAvailabilityError(err),
                        'Esta sala atingiu o limite de jogadores.',
                    );
                    return true;
                },
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('BUG 05 — Persistência, recuperação automática e isolamento de salas do host', () => {
    const hostAId = 'host-a-uuid';
    const hostBId = 'host-b-uuid';

    const roomWaitingHostA: ApiHostRoom = {
        id: 'room-a1',
        code: 'HOSTA1',
        hostId: hostAId,
        maxPlayers: 15,
        questionTime: 30,
        gameMode: 'CLASSIC',
        status: 'WAITING',
        createdAt: '2026-11-18T12:00:00.000Z',
        updatedAt: '2026-11-18T12:00:00.000Z',
        players: [
            {
                id: 'p1',
                nickname: 'Ana',
                score: 0,
                joinedAt: '2026-11-18T12:01:00.000Z',
            },
        ],
    };

    const roomInProgressHostA: ApiHostRoom = {
        id: 'room-a2',
        code: 'HOSTA2',
        hostId: hostAId,
        maxPlayers: 20,
        questionTime: 45,
        gameMode: 'HARDCORE',
        status: 'IN_PROGRESS',
        createdAt: '2026-11-18T11:00:00.000Z',
        updatedAt: '2026-11-18T11:30:00.000Z',
        players: [
            {
                id: 'p2',
                nickname: 'Bruno',
                score: 1450,
                joinedAt: '2026-11-18T11:02:00.000Z',
            },
            {
                id: 'p3',
                nickname: 'Carla',
                score: 920,
                joinedAt: '2026-11-18T11:03:00.000Z',
            },
        ],
    };

    const roomHostB: ApiHostRoom = {
        id: 'room-b1',
        code: 'HOSTB1',
        hostId: hostBId,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: 'CLASSIC',
        status: 'WAITING',
        createdAt: '2026-11-18T12:30:00.000Z',
        updatedAt: '2026-11-18T12:30:00.000Z',
        players: [],
    };

    it('1. Carregamento inicial sem ?sala=: deve listar todas as salas do host sem abrir partida automaticamente', async () => {
        const trackerRef = {
            current: { activeSessionKey: null, requestSeq: 0 } as HostSessionTracker,
        };
        let loadedRooms: Room[] = [];
        let selectedRoomId: string | null = 'stale-id';
        let clearedUrl = false;
        const loadingHistory: boolean[] = [];

        await executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            requestedUrlCode: null,
            trackerRef,
            fetchHostRooms: async () => [roomWaitingHostA, roomInProgressHostA],
            mapRoom: (apiRoom, existing) =>
                mapApiRoomToModel(apiRoom, {
                    name: existing?.name,
                    theme: existing?.theme,
                }),
            onResetSessionState: () => {
                loadedRooms = [];
                selectedRoomId = null;
            },
            onLoadingChange: (loading) => loadingHistory.push(loading),
            onError: () => {},
            onSuccess: (result) => {
                loadedRooms = result.rooms;
                selectedRoomId = result.selectedRoomId;
                clearedUrl = result.shouldClearUrlParam;
            },
        });

        assert.equal(loadedRooms.length, 2);
        assert.equal(loadedRooms[0].code, 'HOSTA1');
        assert.equal(loadedRooms[1].code, 'HOSTA2');
        assert.equal(selectedRoomId, null);
        assert.equal(clearedUrl, false);
        assert.deepEqual(loadingHistory, [true, false]);
    });

    it('2. Lista vazia: deve retornar array vazio sem erro quando o host não possuir salas', async () => {
        const trackerRef = {
            current: { activeSessionKey: hostAId, requestSeq: 0 } as HostSessionTracker,
        };
        let loadedRooms: Room[] = [];
        let error: string | null = null;

        await executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            requestedUrlCode: null,
            trackerRef,
            fetchHostRooms: async () => [],
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {},
            onError: (err) => {
                error = err;
            },
            onSuccess: (result) => {
                loadedRooms = result.rooms;
            },
        });

        assert.deepEqual(loadedRooms, []);
        assert.equal(error, null);
    });

    it('3 e 4. Seleção por ?sala=: deve selecionar sala da URL somente se pertencer ao host e rejeitar código de outro usuário', async () => {
        const trackerRef = {
            current: { activeSessionKey: hostAId, requestSeq: 0 } as HostSessionTracker,
        };
        let selectedRoomId: string | null = null;
        let shouldClearUrlParam = false;

        // 3. Código na URL pertence ao host A -> seleciona a sala correspondente
        await executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            requestedUrlCode: ' hosta2 ',
            trackerRef,
            fetchHostRooms: async () => [roomWaitingHostA, roomInProgressHostA],
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {},
            onError: () => {},
            onSuccess: (result) => {
                selectedRoomId = result.selectedRoomId;
                shouldClearUrlParam = result.shouldClearUrlParam;
            },
        });

        assert.equal(selectedRoomId, 'room-a2');
        assert.equal(shouldClearUrlParam, false);

        // 4. Código na URL pertence ao host B ('HOSTB1') -> não seleciona e sinaliza remoção do parâmetro
        await executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            requestedUrlCode: 'HOSTB1',
            trackerRef,
            fetchHostRooms: async () => [roomWaitingHostA, roomInProgressHostA],
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {},
            onError: () => {},
            onSuccess: (result) => {
                selectedRoomId = result.selectedRoomId;
                shouldClearUrlParam = result.shouldClearUrlParam;
            },
        });

        assert.equal(selectedRoomId, null);
        assert.equal(shouldClearUrlParam, true);
    });

    it('5. Prevenção de duplicação: não deve duplicar salas por id ao carregar ou atualizar', async () => {
        const trackerRef = {
            current: { activeSessionKey: hostAId, requestSeq: 0 } as HostSessionTracker,
        };
        let loadedRooms: Room[] = [];

        await executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            trackerRef,
            fetchHostRooms: async () => [
                roomWaitingHostA,
                roomWaitingHostA,
                roomInProgressHostA,
            ],
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {},
            onError: () => {},
            onSuccess: (result) => {
                loadedRooms = result.rooms;
            },
        });

        assert.equal(loadedRooms.length, 2);

        const updatedA1: Room = {
            ...loadedRooms[0],
            name: 'Sala Renomeada',
        };
        const afterUpsert = upsertRoomInList(loadedRooms, updatedA1);
        assert.equal(afterUpsert.length, 2);
        assert.equal(afterUpsert[0].name, 'Sala Renomeada');
        assert.equal(deduplicateRoomsById([...afterUpsert, updatedA1]).length, 2);
    });

    it('6 e 7. Isolamento entre sessões: troca de usuário limpa memória imediatamente e resposta atrasada da sessão anterior é descartada', async () => {
        const trackerRef = {
            current: { activeSessionKey: hostAId, requestSeq: 0 } as HostSessionTracker,
        };
        let resetCalls = 0;
        let activeRooms: Room[] = [mapApiRoomToModel(roomWaitingHostA)];

        let resolveDelayedHostA!: (rooms: ApiHostRoom[]) => void;
        const delayedHostAPromise = new Promise<ApiHostRoom[]>((resolve) => {
            resolveDelayedHostA = resolve;
        });

        // Dispara requisição do Host A (que ficará pendente)
        const pendingHostALoad = executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            trackerRef,
            existingRooms: activeRooms,
            fetchHostRooms: () => delayedHostAPromise,
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {
                resetCalls += 1;
                activeRooms = [];
            },
            onError: () => {},
            onSuccess: (result) => {
                activeRooms = result.rooms;
            },
        });

        // Usuário faz logout e entra como Host B antes da resposta do Host A chegar
        const hostBLoad = await executeLoadHostRooms({
            sessionKey: hostBId,
            expectedHostId: hostBId,
            trackerRef,
            existingRooms: activeRooms,
            fetchHostRooms: async () => [roomHostB],
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {
                resetCalls += 1;
                activeRooms = [];
            },
            onError: () => {},
            onSuccess: (result) => {
                activeRooms = result.rooms;
            },
        });

        assert.equal(resetCalls, 1);
        assert.equal(hostBLoad?.length, 1);
        assert.equal(activeRooms.length, 1);
        assert.equal(activeRooms[0].code, 'HOSTB1');

        // Agora a resposta atrasada do Host A chega: deve ser totalmente ignorada
        resolveDelayedHostA([roomWaitingHostA, roomInProgressHostA]);
        const delayedResult = await pendingHostALoad;

        assert.equal(delayedResult, null);
        assert.equal(activeRooms.length, 1);
        assert.equal(activeRooms[0].code, 'HOSTB1');
    });

    it('8. Recuperação de sala IN_PROGRESS: deve preservar status Em Andamento, jogadores e pontuações persistidas', async () => {
        const trackerRef = {
            current: { activeSessionKey: hostAId, requestSeq: 0 } as HostSessionTracker,
        };
        let loadedRooms: Room[] = [];

        await executeLoadHostRooms({
            sessionKey: hostAId,
            expectedHostId: hostAId,
            requestedUrlCode: 'HOSTA2',
            trackerRef,
            fetchHostRooms: async () => [roomInProgressHostA],
            mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
            onResetSessionState: () => {},
            onError: () => {},
            onSuccess: (result) => {
                loadedRooms = result.rooms;
            },
        });

        assert.equal(loadedRooms.length, 1);
        const recovered = loadedRooms[0];
        assert.equal(recovered.backendStatus, 'IN_PROGRESS');
        assert.equal(recovered.status, 'Em Andamento');
        assert.equal(recovered.gameMode, 'HARDCORE');
        assert.equal(recovered.timeLimit, 45);
        assert.equal(recovered.players.length, 2);
        assert.equal(recovered.players[0].nickname, 'Bruno');
        assert.equal(recovered.players[0].score, 1450);
        assert.equal(recovered.players[1].nickname, 'Carla');
        assert.equal(recovered.players[1].score, 920);
    });

    it('9. Falha de conexão e possibilidade de tentar novamente (listHostRoomsApi + executeLoadHostRooms)', async () => {
        const trackerRef = {
            current: { activeSessionKey: hostAId, requestSeq: 0 } as HostSessionTracker,
        };
        let capturedError = null as string | null;
        let loadedRooms: Room[] = [];
        let shouldFail = true;

        const originalFetch = globalThis.fetch;
        try {
            globalThis.fetch = (async () => {
                if (shouldFail) {
                    throw new Error('Failed to fetch');
                }
                return new Response(
                    JSON.stringify({
                        rooms: [roomWaitingHostA],
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                );
            }) as typeof fetch;

            // Primeira tentativa falha por conexão
            const firstAttempt = await executeLoadHostRooms({
                sessionKey: hostAId,
                expectedHostId: hostAId,
                trackerRef,
                fetchHostRooms: () => listHostRoomsApi('token-host-a'),
                mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
                onResetSessionState: () => {},
                onError: (err) => {
                    capturedError = err;
                },
                onSuccess: (result) => {
                    loadedRooms = result.rooms;
                },
            });

            assert.equal(firstAttempt, null);
            assert.equal(loadedRooms.length, 0);
            assert.equal(
                capturedError,
                'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
            );

            // Segunda tentativa ("Tentar novamente") recupera as salas com sucesso
            shouldFail = false;
            const retryAttempt = await executeLoadHostRooms({
                sessionKey: hostAId,
                expectedHostId: hostAId,
                trackerRef,
                fetchHostRooms: () => listHostRoomsApi('token-host-a'),
                mapRoom: (apiRoom) => mapApiRoomToModel(apiRoom),
                onResetSessionState: () => {},
                onError: (err) => {
                    capturedError = err;
                },
                onSuccess: (result) => {
                    loadedRooms = result.rooms;
                },
            });

            assert.equal(retryAttempt?.length, 1);
            assert.equal(capturedError, null);
            assert.equal(loadedRooms.length, 1);
            assert.equal(loadedRooms[0].code, 'HOSTA1');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('10. Formatação segura de startedAt e finishedAt nullable no frontend', () => {
        assert.equal(formatNullableDateTime(null), 'Não registrado');
        assert.equal(formatNullableDateTime(undefined, 'Não iniciado'), 'Não iniciado');
        assert.equal(formatNullableDateTime('', 'Não iniciado'), 'Não iniciado');
        assert.equal(formatNullableDateTime('data-invalida'), 'Não registrado');

        const formatted = formatNullableDateTime('2026-11-18T15:30:00.000Z');
        assert.notEqual(formatted, 'Não registrado');
        assert.equal(formatted.includes('1969'), false);
        assert.equal(formatted.includes('1970'), false);
    });

    it('11. Mapeamento de ApiHostRoom preserva name, theme e fallback de players em currentGame', () => {
        const apiRoom: ApiHostRoom = {
            id: 'room-proj-1',
            code: 'PRJ123',
            name: 'Sala Biologia',
            theme: 'Ciências',
            hostId: 'host-1',
            maxPlayers: 12,
            questionTime: 45,
            gameMode: 'HARDCORE',
            status: 'WAITING',
            roomStatus: 'ACTIVE',
            archivedAt: null,
            createdAt: '2026-11-18T15:00:00.000Z',
            updatedAt: '2026-11-18T15:00:00.000Z',
            currentGame: {
                id: 'game-proj-1',
                status: 'WAITING',
                maxPlayers: 12,
                questionTime: 45,
                gameMode: 'HARDCORE',
                startedAt: null,
                finishedAt: null,
                createdAt: '2026-11-18T15:00:00.000Z',
                players: [
                    {
                        id: 'gp-1',
                        nickname: 'Mariana',
                        score: 0,
                        joinedAt: '2026-11-18T15:01:00.000Z',
                    },
                ],
            },
        };

        const mapped = mapApiRoomToModel(apiRoom);
        assert.equal(mapped.name, 'Sala Biologia');
        assert.equal(mapped.theme, 'Ciências');
        assert.equal(mapped.backendStatus, 'WAITING');
        assert.equal(mapped.players.length, 1);
        assert.equal(mapped.players[0].nickname, 'Mariana');
    });
});

describe('Preservação dos nomes das salas (Mapeamento, Edição e Lobby do Jogador)', () => {
    const baseApiRoom: ApiHostRoom = {
        id: 'room-name-1',
        code: 'NME123',
        name: '  Arena de Redes  ',
        theme: '  Infraestrutura  ',
        hostId: 'host-1',
        maxPlayers: 15,
        questionTime: 30,
        gameMode: 'CLASSIC',
        status: 'WAITING',
        createdAt: '2026-11-23T00:00:00.000Z',
        updatedAt: '2026-11-23T00:00:00.000Z',
        players: [],
    };

    it('1. Mapeamento: prioriza nome válido da API, recorre a meta.name quando ausente/vazio/espaços e usa Sala ${code} apenas como último recurso', async () => {
        // API com nome válido prevalece sobre meta.name local (incluindo fallback antigo)
        const fromApi = mapApiRoomToModel(baseApiRoom, {
            name: 'Sala NME123',
            theme: 'Geral',
        });
        assert.equal(fromApi.name, 'Arena de Redes');
        assert.equal(fromApi.theme, 'Infraestrutura');
        assert.equal(fromApi.code, 'NME123');

        // API com string vazia ou apenas espaços usa fallback local meta.name
        const fromMetaOnEmpty = mapApiRoomToModel(
            { ...baseApiRoom, name: '   ' },
            { name: '  Quiz de Algoritmos  ' },
        );
        assert.equal(fromMetaOnEmpty.name, 'Quiz de Algoritmos');

        // API com nome nulo ou ausente usa fallback local meta.name
        const fromMetaOnNull = mapApiRoomToModel(
            { ...baseApiRoom, name: null },
            { name: 'Quiz de Banco de Dados' },
        );
        assert.equal(fromMetaOnNull.name, 'Quiz de Banco de Dados');

        const fromMetaOnUndefined = mapApiRoomToModel(
            { ...baseApiRoom, name: undefined },
            { name: 'Quiz de Engenharia' },
        );
        assert.equal(fromMetaOnUndefined.name, 'Quiz de Engenharia');

        // Sem nome válido nem na API nem em meta.name -> fallback Sala ${code}
        const fallbackCode = mapApiRoomToModel(
            { ...baseApiRoom, name: '   ' },
            { name: '   ' },
        );
        assert.equal(fallbackCode.name, 'Sala NME123');

        // Ao recarregar salas do host (executeLoadHostRooms), fallback antigo em memória não sobrescreve nome real vindo da API
        const trackerRef = {
            current: { activeSessionKey: 'host-1', requestSeq: 0 } as HostSessionTracker,
        };
        const existingFallbackRoom: Room = {
            ...fromApi,
            name: 'Sala NME123',
        };
        let reloadedRooms: Room[] = [];

        await executeLoadHostRooms({
            sessionKey: 'host-1',
            expectedHostId: 'host-1',
            trackerRef,
            existingRooms: [existingFallbackRoom],
            fetchHostRooms: async () => [baseApiRoom],
            mapRoom: (apiRoom, existing) =>
                mapApiRoomToModel(apiRoom, {
                    name: existing?.name,
                    theme: existing?.theme,
                }),
            onResetSessionState: () => {},
            onError: () => {},
            onSuccess: (result) => {
                reloadedRooms = result.rooms;
            },
        });

        assert.equal(reloadedRooms.length, 1);
        assert.equal(reloadedRooms[0].name, 'Arena de Redes');
    });

    it('2. Edição: usa resposta do PATCH para atualizar lista e sala ativa sem ser sobrescrita pelo nome anterior', async () => {
        const originalFetch = globalThis.fetch;
        const lockRef = { current: false };
        let rooms: Room[] = [
            {
                id: 'room-name-1',
                code: 'NME123',
                name: 'Nome Antigo',
                theme: 'Tema Antigo',
                timeLimit: 30,
                maxPlayers: 10,
                gameMode: 'CLASSIC',
                status: 'Aguardando',
                backendStatus: 'WAITING',
                questionIds: ['q1', 'q2'],
                players: [
                    {
                        id: 'p-1',
                        nickname: 'Ana',
                        score: 0,
                        joinedAt: '2026-11-23T00:01:00.000Z',
                    },
                ],
            },
        ];
        const activeRoomId = 'room-name-1';

        try {
            globalThis.fetch = (async () =>
                new Response(
                    JSON.stringify({
                        id: 'room-name-1',
                        code: 'NME123',
                        name: 'Nome Normalizado Backend',
                        theme: 'Redes Avançadas',
                        hostId: 'host-1',
                        maxPlayers: 25,
                        questionTime: 45,
                        gameMode: 'HARDCORE',
                        status: 'WAITING',
                        createdAt: '2026-11-23T00:00:00.000Z',
                        updatedAt: '2026-11-23T00:05:00.000Z',
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )) as typeof fetch;

            const ok = await executeSubmitRoom({
                input: {
                    name: 'Novo Nome Digitado',
                    theme: 'Redes',
                    maxPlayers: 25,
                    timeLimit: 45,
                    gameMode: 'HARDCORE',
                },
                lockRef,
                executeRequest: (validInput) =>
                    updateRoomApi('room-name-1', {
                        name: validInput.name.trim(),
                        theme: validInput.theme.trim(),
                        maxPlayers: validInput.maxPlayers,
                        questionTime: validInput.timeLimit,
                        gameMode: validInput.gameMode,
                    }),
                onError: () => {},
                onSuccess: (apiRoom, validInput) => {
                    rooms = rooms.map((room) => {
                        if (room.id !== activeRoomId) return room;
                        const mappedRoom = mapApiRoomToModel(apiRoom, {
                            name: validInput.name.trim(),
                            theme: validInput.theme.trim(),
                            questionIds: room.questionIds,
                        });
                        return {
                            ...room,
                            ...mappedRoom,
                            players:
                                'players' in apiRoom && Array.isArray(apiRoom.players)
                                    ? mappedRoom.players
                                    : room.players,
                        };
                    });
                },
            });

            assert.equal(ok, true);
            const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
            assert.equal(rooms[0].name, 'Nome Normalizado Backend');
            assert.equal(activeRoom?.name, 'Nome Normalizado Backend');
            assert.equal(activeRoom?.theme, 'Redes Avançadas');
            assert.equal(activeRoom?.code, 'NME123');
            assert.deepEqual(activeRoom?.questionIds, ['q1', 'q2']);
            assert.equal(activeRoom?.players.length, 1);
        } finally {
            globalThis.fetch = originalFetch;
        }

        const roomsVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );
        assert.match(roomsVmSource, /if\s*\(editingRoom\)\s*\{[\s\S]*mapApiRoomToModel\(apiRoom/);
    });

    it('3. Lobby do jogador: usa lobby.name, faz fallback para Sala de ${host.name} e preserva após recuperação/snapshot', async () => {
        const lobbyWithName: ApiRoomLobby = {
            id: 'room-name-1',
            code: 'NME123',
            name: '  Quiz Arquitetura  ',
            theme: 'Computação',
            status: 'WAITING',
            roomStatus: 'ACTIVE',
            gameMode: 'CLASSIC',
            maxPlayers: 10,
            questionTime: 30,
            createdAt: '2026-11-23T00:00:00.000Z',
            host: { id: 'host-1', name: 'Prof. Carlos' },
            players: [],
            playerCount: 0,
            currentGame: {
                id: 'game-1',
                status: 'WAITING',
                maxPlayers: 10,
                questionTime: 30,
                gameMode: 'CLASSIC',
                startedAt: null,
                finishedAt: null,
                createdAt: '2026-11-23T00:00:00.000Z',
            },
        };

        const mappedNamed = mapLobbyToPlayerGameRoom(lobbyWithName);
        assert.equal(mappedNamed.title, 'Quiz Arquitetura');
        assert.equal(mappedNamed.pin, 'NME123');

        const mappedEmptyName = mapLobbyToPlayerGameRoom({
            ...lobbyWithName,
            name: '   ',
        });
        assert.equal(mappedEmptyName.title, 'Sala de Prof. Carlos');
        assert.equal(mappedEmptyName.pin, 'NME123');

        const mappedNullName = mapLobbyToPlayerGameRoom({
            ...lobbyWithName,
            name: null,
        });
        assert.equal(mappedNullName.title, 'Sala de Prof. Carlos');

        // Recuperação de sessão (F5 / reconexão) preserva lobby.name no snapshot recuperado
        let recoveredTitle = '';
        let recoveredPin = '';
        const lockRef = { current: false };
        const status = await executeRecoverPlayerSession({
            persistedSession: {
                sessionToken: 'tok-1',
                roomCode: 'NME123',
                roomId: 'room-name-1',
                gameId: 'game-1',
                playerId: 'player-1',
                nickname: 'Ana',
            },
            lockRef,
            fetchLobby: async () => lobbyWithName,
            setIsRecovering: () => {},
            setError: () => {},
            onRecovered: (lobby) => {
                const gameRoom = mapLobbyToPlayerGameRoom(lobby);
                recoveredTitle = gameRoom.title;
                recoveredPin = gameRoom.pin;
            },
            onSessionInvalid: () => {},
        });

        assert.equal(status, 'recovered');
        assert.equal(recoveredTitle, 'Quiz Arquitetura');
        assert.equal(recoveredPin, 'NME123');

        const playVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );
        const matches = playVmSource.match(/mapLobbyToPlayerGameRoom\(/g) ?? [];
        assert.equal(matches.length, 2);
    });
});
