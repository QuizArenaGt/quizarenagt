import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_ROOM_CODE_INPUT_LENGTH,
    PIN_LENGTH,
    buildPlayRouteWithPin,
    executeVerifyRoomCode,
    formatRoomAvailabilityError,
    isValidRoomCode,
    normalizeRoomCode,
    normalizeRoomCodeInput,
    sanitizePin,
    validateRoomCode,
    type PlayPhase,
} from '../src/models/game.ts';
import {
    executeLoadRoomByCode,
    executeSubmitRoom,
    formatRoomCode,
    getClipboardRoomCode,
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
    mapApiRoomToModel,
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
