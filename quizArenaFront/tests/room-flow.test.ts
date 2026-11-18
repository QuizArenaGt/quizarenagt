import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_ROOM_CODE_INPUT_LENGTH,
    buildPlayRouteWithPin,
    isValidRoomCode,
    normalizeRoomCode,
    sanitizePin,
    validateRoomCode,
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
