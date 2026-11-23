import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    OPTION_MAX_LENGTH,
    STATEMENT_MAX_LENGTH,
    draftToQuestion,
    validateDraft,
    type Question,
    type QuestionDraft,
} from '../src/models/question.ts';
import {
    InvalidImportResponseError,
    MAX_IMPORT_FILE_BYTES,
    MAX_IMPORT_QUESTIONS,
    PREVIEW_PAGE_SIZE,
    applyValidatedJsonTextToModalState,
    canCloseImportModal,
    canConfirmImportState,
    createInitialImportModalState,
    createQuestionImportTracker,
    describeImportOutcome,
    executeImportQuestionsBatch,
    formatImportFileSize,
    mergeImportedQuestionsWithStats,
    paginatePreviewItems,
    parseAndValidateImportJson,
    recomputeImportStateDuplicates,
    syncQuestionImportRoom,
    validateImportFileMeta,
    type ImportQuestionInput,
    type QuestionImportPreviewItem,
} from '../src/models/questionImport.ts';
import { ApiError } from '../src/services/api.ts';
import {
    importQuestionsApi,
    type ApiQuestion,
} from '../src/services/questionStorageService.ts';

describe('Etapa 2.1 — Domínio e validação pura da importação JSON', () => {
    it('1. aceita JSON válido com MULTIPLE_CHOICE e TRUE_FALSE, aplicando default MULTIPLE_CHOICE quando type é omitido', () => {
        const rawJson = JSON.stringify({
            questions: [
                {
                    statement: '  Qual é a capital do Brasil?  ',
                    type: 'MULTIPLE_CHOICE',
                    options: [
                        { text: '  Brasília ', isCorrect: true },
                        { text: 'São Paulo', isCorrect: false },
                        { text: 'Rio de Janeiro', isCorrect: false },
                    ],
                },
                {
                    statement: 'Qual porta padrão HTTPS?',
                    options: [
                        { text: '80', isCorrect: false },
                        { text: '443', isCorrect: true },
                    ],
                },
                {
                    statement: 'O protocolo TCP garante entrega ordenada.',
                    type: 'TRUE_FALSE',
                    options: [
                        { text: 'Verdadeiro', isCorrect: true },
                        { text: 'Falso', isCorrect: false },
                    ],
                },
            ],
        });

        const result = parseAndValidateImportJson(rawJson);
        assert.equal(result.valid, true);
        if (result.valid) {
            assert.equal(result.questions.length, 3);
            assert.equal(
                result.questions[0]?.statement,
                'Qual é a capital do Brasil?',
            );
            assert.equal(result.questions[0]?.options[0]?.text, 'Brasília');
            assert.equal(result.questions[1]?.type, 'MULTIPLE_CHOICE');
            assert.equal(result.questions[2]?.type, 'TRUE_FALSE');
            assert.deepEqual(result.warnings, []);
        }
    });

    it('2. rejeita JSON malformado e raiz inválida', () => {
        const malformed = parseAndValidateImportJson('{ "questions": [');
        assert.equal(malformed.valid, false);
        if (!malformed.valid) {
            assert.equal(malformed.errors[0]?.field, 'root');
        }

        for (const root of ['[]', '"texto"', '123', 'null', 'true']) {
            const res = parseAndValidateImportJson(root);
            assert.equal(res.valid, false);
            if (!res.valid) {
                assert.equal(res.errors[0]?.field, 'root');
            }
        }
    });

    it('3. valida metadados e conteúdo de arquivo vazio ou acima de 1 MB', () => {
        assert.equal(
            validateImportFileMeta({
                name: 'quiz.txt',
                size: 100,
                type: 'text/plain',
            }).valid,
            false,
        );

        assert.equal(
            validateImportFileMeta({
                name: 'quiz.json',
                size: 0,
                type: 'application/json',
            }).valid,
            false,
        );

        assert.equal(
            validateImportFileMeta({
                name: 'quiz.json',
                size: MAX_IMPORT_FILE_BYTES + 1,
                type: 'application/json',
            }).valid,
            false,
        );

        assert.equal(
            validateImportFileMeta({
                name: 'quiz.json',
                size: MAX_IMPORT_FILE_BYTES,
                type: '',
            }).valid,
            true,
        );

        const emptyText = parseAndValidateImportJson('   \n  ');
        assert.equal(emptyText.valid, false);

        const oversizedText = parseAndValidateImportJson(
            ' '.repeat(MAX_IMPORT_FILE_BYTES + 2),
        );
        assert.equal(oversizedText.valid, false);

        const oversizedUtf8Json = JSON.stringify({
            questions: [
                {
                    statement: 'a'.repeat(MAX_IMPORT_FILE_BYTES + 100),
                    options: [
                        { text: 'A', isCorrect: true },
                        { text: 'B', isCorrect: false },
                    ],
                },
            ],
        });
        const oversizedParsed = parseAndValidateImportJson(oversizedUtf8Json);
        assert.equal(oversizedParsed.valid, false);
        if (!oversizedParsed.valid) {
            assert.equal(oversizedParsed.errors[0]?.field, 'file');
        }
    });

    it('4. rejeita questions ausente, vazio ou acima de 100 e aceita exatamente 100 questões válidas', () => {
        const missing = parseAndValidateImportJson('{}');
        assert.equal(missing.valid, false);

        const emptyArray = parseAndValidateImportJson(
            JSON.stringify({ questions: [] }),
        );
        assert.equal(emptyArray.valid, false);

        const buildQuestions = (count: number) =>
            Array.from({ length: count }, (_, idx) => ({
                statement: `Pergunta número ${idx + 1}`,
                type: 'TRUE_FALSE' as const,
                options: [
                    { text: 'Verdadeiro', isCorrect: true },
                    { text: 'Falso', isCorrect: false },
                ],
            }));

        const exactly100 = parseAndValidateImportJson(
            JSON.stringify({ questions: buildQuestions(MAX_IMPORT_QUESTIONS) }),
        );
        assert.equal(exactly100.valid, true);
        if (exactly100.valid) {
            assert.equal(exactly100.questions.length, 100);
        }

        const over100 = parseAndValidateImportJson(
            JSON.stringify({
                questions: buildQuestions(MAX_IMPORT_QUESTIONS + 1),
            }),
        );
        assert.equal(over100.valid, false);
        if (!over100.valid) {
            assert.equal(over100.errors[0]?.field, 'questions');
            assert.match(over100.errors[0]!.message, /100/);
        }
    });

    it('5. rejeita enunciados e alternativas inválidos, quantidade incorreta de corretas e indica número da pergunta e campo', () => {
        const res = parseAndValidateImportJson(
            JSON.stringify({
                questions: [
                    {
                        statement: '   ',
                        options: [
                            { text: 'A', isCorrect: true },
                            { text: 'B', isCorrect: false },
                        ],
                    },
                    {
                        statement: 'a'.repeat(STATEMENT_MAX_LENGTH + 1),
                        type: 'TIPO_ERRADO',
                        options: [
                            { text: 'A', isCorrect: true },
                            { text: 'B', isCorrect: false },
                        ],
                    },
                    {
                        statement: 'Pergunta com opção longa',
                        options: [
                            {
                                text: 'b'.repeat(OPTION_MAX_LENGTH + 1),
                                isCorrect: true,
                            },
                            { text: 'B', isCorrect: false },
                        ],
                    },
                    {
                        statement: 'Sem correta',
                        options: [
                            { text: 'A', isCorrect: false },
                            { text: 'B', isCorrect: false },
                        ],
                    },
                    {
                        statement: 'Múltiplas corretas',
                        options: [
                            { text: 'A', isCorrect: true },
                            { text: 'B', isCorrect: true },
                        ],
                    },
                    {
                        statement: 'Muitas alternativas',
                        options: [
                            { text: '1', isCorrect: true },
                            { text: '2', isCorrect: false },
                            { text: '3', isCorrect: false },
                            { text: '4', isCorrect: false },
                            { text: '5', isCorrect: false },
                        ],
                    },
                    {
                        statement: 'isCorrect string',
                        options: [
                            { text: '1', isCorrect: 'true' },
                            { text: '2', isCorrect: false },
                        ],
                    },
                ],
            }),
        );

        assert.equal(res.valid, false);
        if (!res.valid) {
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 1 && e.field === 'statement',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 2 && e.field === 'statement',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 2 && e.field === 'type',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 3 && e.field === 'options',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 4 && e.field === 'options',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 5 && e.field === 'options',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 6 && e.field === 'options',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 7 && e.field === 'options',
                ),
            );
        }
    });

    it('6. rejeita alternativas duplicadas, enunciados duplicados no arquivo e TRUE_FALSE inválido', () => {
        const res = parseAndValidateImportJson(
            JSON.stringify({
                questions: [
                    {
                        statement: 'Qual a capital da França?',
                        options: [
                            { text: '  Paris ', isCorrect: true },
                            { text: 'paris', isCorrect: false },
                        ],
                    },
                    {
                        statement: '  qual a capital da frança?  ',
                        type: 'TRUE_FALSE',
                        options: [
                            { text: 'Sim', isCorrect: true },
                            { text: 'Não', isCorrect: false },
                        ],
                    },
                    {
                        statement: 'V/F com 3 opções',
                        type: 'TRUE_FALSE',
                        options: [
                            { text: 'Verdadeiro', isCorrect: true },
                            { text: 'Falso', isCorrect: false },
                            { text: 'Outro', isCorrect: false },
                        ],
                    },
                ],
            }),
        );

        assert.equal(res.valid, false);
        if (!res.valid) {
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 1 && e.field === 'options',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) =>
                        e.questionNumber === 2 &&
                        e.field === 'statement' &&
                        /duplicado/i.test(e.message),
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 2 && e.field === 'options',
                ),
            );
            assert.ok(
                res.errors.some(
                    (e) => e.questionNumber === 3 && e.field === 'options',
                ),
            );
        }
    });

    it('7. gera apenas avisos não bloqueantes para enunciados já existentes na sala (trim + case-insensitive)', () => {
        const existingInRoom: Pick<Question, 'statement'>[] = [
            { statement: 'Qual é a capital do Brasil?' },
        ];

        const rawJson = JSON.stringify({
            questions: [
                {
                    statement: '  QUAL É A CAPITAL DO BRASIL? ',
                    options: [
                        { text: 'Brasília', isCorrect: true },
                        { text: 'Rio de Janeiro', isCorrect: false },
                    ],
                },
                {
                    statement: 'Pergunta inédita na sala',
                    type: 'TRUE_FALSE',
                    options: [
                        { text: 'Verdadeiro', isCorrect: true },
                        { text: 'Falso', isCorrect: false },
                    ],
                },
            ],
        });

        const result = parseAndValidateImportJson(rawJson, existingInRoom);
        assert.equal(result.valid, true);
        if (result.valid) {
            assert.equal(result.questions.length, 2);
            assert.equal(result.warnings.length, 1);
            assert.equal(result.warnings[0]?.questionNumber, 1);
            assert.equal(result.previewItems[0]?.duplicateInRoom, true);
            assert.equal(result.previewItems[1]?.duplicateInRoom, false);
        }
    });

    it('8. preserva comportamento existente de validateDraft e draftToQuestion', () => {
        const draft: QuestionDraft = {
            statement: 'Pergunta manual',
            theme: '',
            type: 'TRUE_FALSE',
            choices: [
                { id: 'c1', text: '' },
                { id: 'c2', text: '' },
            ],
            correctChoiceId: null,
            trueFalseAnswer: true,
        };

        assert.equal(validateDraft(draft), null);
        const question = draftToQuestion(draft, null);
        assert.equal(question.theme, 'Geral');
        assert.deepEqual(
            question.options.map((o) => [o.text, o.isCorrect]),
            [
                ['Verdadeiro', true],
                ['Falso', false],
            ],
        );
    });
});

describe('Etapa 2.2 — Service HTTP, isolamento por sala e validação de resposta', () => {
    const sampleBatch: ImportQuestionInput[] = [
        {
            statement: 'Qual porta padrão HTTPS?',
            type: 'MULTIPLE_CHOICE',
            options: [
                { text: '80', isCorrect: false },
                { text: '443', isCorrect: true },
            ],
        },
        {
            statement: 'O protocolo TCP garante entrega ordenada.',
            type: 'TRUE_FALSE',
            options: [
                { text: 'Verdadeiro', isCorrect: true },
                { text: 'Falso', isCorrect: false },
            ],
        },
    ];

    const makeApiQuestion = (
        id: string,
        statement: string,
        type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' = 'MULTIPLE_CHOICE',
        isActive = true,
        roomId = 'room-1',
    ): ApiQuestion => ({
        id,
        roomId,
        statement,
        type,
        isActive,
        createdAt: '2026-11-22T22:00:00.000Z',
        updatedAt: '2026-11-22T22:00:00.000Z',
        options: [
            {
                id: `${id}-opt-1`,
                questionId: id,
                text: type === 'TRUE_FALSE' ? 'Verdadeiro' : 'Opção A',
                isCorrect: true,
                position: 0,
            },
            {
                id: `${id}-opt-2`,
                questionId: id,
                text: type === 'TRUE_FALSE' ? 'Falso' : 'Opção B',
                isCorrect: false,
                position: 1,
            },
        ],
    });

    const makeModelQuestion = (
        id: string,
        statement: string,
        type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' = 'MULTIPLE_CHOICE',
        isActive = true,
        roomId = 'room-1',
    ): Question => ({
        id,
        roomId,
        statement,
        type,
        isActive,
        theme: 'Geral',
        options: [
            { id: `${id}-opt-1`, text: 'A', isCorrect: true },
            { id: `${id}-opt-2`, text: 'B', isCorrect: false },
        ],
    });

    it('9. importQuestionsApi envia POST para /rooms/:id/questions/import com roomId codificado e payload exato', async () => {
        const originalFetch = globalThis.fetch;
        let calledUrl = '';
        let calledMethod = '';
        let calledBody = '';

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calledUrl = String(input);
            calledMethod = init?.method ?? 'GET';
            calledBody = String(init?.body ?? '');
            return new Response(
                JSON.stringify({
                    message: '2 perguntas importadas com sucesso.',
                    importedCount: 2,
                    questions: [
                        makeApiQuestion('q-imp-1', sampleBatch[0]!.statement),
                        makeApiQuestion(
                            'q-imp-2',
                            sampleBatch[1]!.statement,
                            'TRUE_FALSE',
                        ),
                    ],
                }),
                {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }) as typeof fetch;

        try {
            const response = await importQuestionsApi(
                'room/special?id=1',
                sampleBatch,
            );
            assert.match(
                calledUrl,
                /\/rooms\/room%2Fspecial%3Fid%3D1\/questions\/import$/,
            );
            assert.equal(calledMethod, 'POST');
            assert.deepEqual(JSON.parse(calledBody), { questions: sampleBatch });
            assert.equal(response.importedCount, 2);
            assert.equal(response.questions.length, 2);
            assert.equal(response.questions[0]?.id, 'q-imp-1');
            assert.equal(response.questions[1]?.type, 'TRUE_FALSE');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('10. isolamento por sala: troca de Sala A pendente para Sala B libera loading/envio de B e resposta tardia de A não contamina B', async () => {
        const tracker = createQuestionImportTracker('room-A');
        const stateByRoom: Record<string, Question[]> = {
            'room-A': [makeModelQuestion('q-a-old', 'Prévia A', 'MULTIPLE_CHOICE', true, 'room-A')],
            'room-B': [makeModelQuestion('q-b-old', 'Prévia B', 'MULTIPLE_CHOICE', true, 'room-B')],
        };
        let isImporting = false;
        const loadingHistory: boolean[] = [];

        const setLoading = (val: boolean) => {
            isImporting = val;
            loadingHistory.push(val);
        };

        let resolveRoomA!: () => void;
        let resolveRoomB!: () => void;
        const gateA = new Promise<void>((r) => {
            resolveRoomA = r;
        });
        const gateB = new Promise<void>((r) => {
            resolveRoomB = r;
        });

        // 1. Inicia importação na Sala A
        const promiseA = executeImportQuestionsBatch({
            roomId: 'room-A',
            questions: sampleBatch,
            tracker,
            getCurrentQuestions: () => stateByRoom['room-A'] ?? [],
            onImportingChange: setLoading,
            requestImport: async () => {
                await gateA;
                return {
                    message: 'ok A',
                    importedCount: 2,
                    questions: [
                        makeModelQuestion('q-a-1', 'Nova A1', 'MULTIPLE_CHOICE', true, 'room-A'),
                        makeModelQuestion('q-a-2', 'Nova A2', 'TRUE_FALSE', true, 'room-A'),
                    ],
                };
            },
            onApplyQuestions: (next, targetRoomId) => {
                stateByRoom[targetRoomId] = next;
            },
        });

        assert.equal(isImporting, true);

        // 2. Enquanto A está pendente, usuário troca para Sala B -> loading de B deve ir para false
        syncQuestionImportRoom(tracker, 'room-B', setLoading);
        assert.equal(isImporting, false);

        // 3. Usuário inicia importação na Sala B sem ser bloqueado pela pendência da Sala A
        const promiseB = executeImportQuestionsBatch({
            roomId: 'room-B',
            questions: [sampleBatch[0]!],
            tracker,
            getCurrentQuestions: () => stateByRoom['room-B'] ?? [],
            onImportingChange: setLoading,
            requestImport: async () => {
                await gateB;
                return {
                    message: 'ok B',
                    importedCount: 1,
                    questions: [
                        makeModelQuestion('q-b-1', 'Nova B1', 'MULTIPLE_CHOICE', true, 'room-B'),
                    ],
                };
            },
            onApplyQuestions: (next, targetRoomId) => {
                stateByRoom[targetRoomId] = next;
            },
        });

        assert.equal(isImporting, true);

        // 4. Resposta tardia da Sala A chega enquanto B ainda está em andamento:
        //    não deve alterar perguntas de B nem desligar o loading de B!
        resolveRoomA();
        const resultA = await promiseA;
        assert.equal(resultA.success, false);
        if (!resultA.success) {
            assert.equal(resultA.status, 'STALE_ROOM');
        }
        assert.equal(isImporting, true);
        assert.deepEqual(
            stateByRoom['room-B']?.map((q) => q.id),
            ['q-b-old'],
        );

        // 5. Sala B conclui normalmente
        resolveRoomB();
        const resultB = await promiseB;
        assert.equal(resultB.success, true);
        if (resultB.success) {
            assert.equal(resultB.status, 'COMPLETED');
            assert.equal(resultB.addedCount, 1);
        }
        assert.equal(isImporting, false);
        assert.deepEqual(
            stateByRoom['room-B']?.map((q) => q.id),
            ['q-b-old', 'q-b-1'],
        );

        // 6. Retry na Sala A após retorno funciona normalmente sem trava presa
        syncQuestionImportRoom(tracker, 'room-A', setLoading);
        assert.equal(isImporting, false);
        const retryA = await executeImportQuestionsBatch({
            roomId: 'room-A',
            questions: [sampleBatch[0]!],
            tracker,
            getCurrentQuestions: () => stateByRoom['room-A'] ?? [],
            onImportingChange: setLoading,
            requestImport: async () => ({
                message: 'retry ok',
                importedCount: 1,
                questions: [
                    makeModelQuestion('q-a-retry', 'Retry A', 'MULTIPLE_CHOICE', true, 'room-A'),
                ],
            }),
            onApplyQuestions: (next, targetRoomId) => {
                stateByRoom[targetRoomId] = next;
            },
        });
        assert.equal(retryA.success, true);
        assert.deepEqual(
            stateByRoom['room-A']?.map((q) => q.id),
            ['q-a-old', 'q-a-retry'],
        );
        assert.ok(loadingHistory.length >= 4);
    });

    it('11. bloqueia submissão simultânea na mesma sala sincronamente e libera trava após erro ou sucesso', async () => {
        const tracker = createQuestionImportTracker('room-1');
        let stateQuestions: Question[] = [];
        let apiCalls = 0;
        let releaseGate!: () => void;
        const gate = new Promise<void>((r) => {
            releaseGate = r;
        });

        const firstPromise = executeImportQuestionsBatch({
            roomId: 'room-1',
            questions: sampleBatch,
            tracker,
            getCurrentQuestions: () => stateQuestions,
            requestImport: async () => {
                apiCalls += 1;
                await gate;
                return {
                    message: 'ok',
                    importedCount: 2,
                    questions: [
                        makeModelQuestion('q-1', sampleBatch[0]!.statement),
                        makeModelQuestion('q-2', sampleBatch[1]!.statement, 'TRUE_FALSE'),
                    ],
                };
            },
            onApplyQuestions: (next) => {
                stateQuestions = next;
            },
        });

        const concurrentAttempt = await executeImportQuestionsBatch({
            roomId: 'room-1',
            questions: sampleBatch,
            tracker,
            getCurrentQuestions: () => stateQuestions,
            requestImport: async () => {
                apiCalls += 1;
                return { message: '', importedCount: 0, questions: [] };
            },
            onApplyQuestions: () => {},
        });

        assert.equal(concurrentAttempt.success, false);
        if (!concurrentAttempt.success) {
            assert.equal(concurrentAttempt.status, 'ALREADY_IMPORTING');
        }
        assert.equal(apiCalls, 1);

        releaseGate();
        const firstResult = await firstPromise;
        assert.equal(firstResult.success, true);
        assert.equal(stateQuestions.length, 2);
    });

    it('12. trata erros HTTP (400, 401, 403, 404, 409, 413, 500) e erro de rede preservando estado anterior e permitindo retry', async () => {
        const existing = [makeModelQuestion('q-old', 'Existente')];
        let stateQuestions = [...existing];
        const tracker = createQuestionImportTracker('room-1');

        const cases: {
            thrown: unknown;
            expectedHttpStatus?: number;
            expectedPattern: RegExp;
            expectedFieldErrorKey?: string;
        }[] = [
            {
                thrown: new ApiError('Dados inválidos.', 400, {
                    'questions[0].statement': 'Pergunta 1: enunciado obrigatório.',
                }),
                expectedHttpStatus: 400,
                expectedPattern: /enunciado obrigatório/i,
                expectedFieldErrorKey: 'questions[0].statement',
            },
            {
                thrown: new ApiError('Não autenticado.', 401),
                expectedHttpStatus: 401,
                expectedPattern: /sessão expirou/i,
            },
            {
                thrown: new ApiError('Sem permissão.', 403),
                expectedHttpStatus: 403,
                expectedPattern: /não tem permissão/i,
            },
            {
                thrown: new ApiError('Não encontrada.', 404),
                expectedHttpStatus: 404,
                expectedPattern: /sala não encontrada/i,
            },
            {
                thrown: new ApiError('Partida em andamento.', 409),
                expectedHttpStatus: 409,
                expectedPattern: /em andamento/i,
            },
            {
                thrown: new ApiError('Payload maior que 1 MB.', 413),
                expectedHttpStatus: 413,
                expectedPattern: /1 MB/i,
            },
            {
                thrown: new ApiError('Falha interna.', 500),
                expectedHttpStatus: 500,
                expectedPattern: /falha no servidor/i,
            },
            {
                thrown: new Error('Failed to fetch'),
                expectedPattern: /conectar ao servidor/i,
            },
        ];

        for (const testCase of cases) {
            const res = await executeImportQuestionsBatch({
                roomId: 'room-1',
                questions: sampleBatch,
                tracker,
                getCurrentQuestions: () => stateQuestions,
                requestImport: async () => {
                    throw testCase.thrown;
                },
                onApplyQuestions: (next) => {
                    stateQuestions = next;
                },
            });

            assert.equal(res.success, false);
            assert.deepEqual(
                stateQuestions.map((q) => q.id),
                ['q-old'],
            );
            if (!res.success) {
                assert.equal(res.status, 'API_ERROR');
                assert.equal(res.httpStatus, testCase.expectedHttpStatus);
                assert.match(res.error, testCase.expectedPattern);
                if (testCase.expectedFieldErrorKey) {
                    assert.ok(
                        res.fieldErrors?.[testCase.expectedFieldErrorKey],
                    );
                }
            }
        }

        // Retry após sequência de erros funciona normalmente
        const retryOk = await executeImportQuestionsBatch({
            roomId: 'room-1',
            questions: [sampleBatch[0]!],
            tracker,
            getCurrentQuestions: () => stateQuestions,
            requestImport: async () => ({
                message: 'ok',
                importedCount: 1,
                questions: [makeModelQuestion('q-retry', 'Após falha')],
            }),
            onApplyQuestions: (next) => {
                stateQuestions = next;
            },
        });

        assert.equal(retryOk.success, true);
        assert.deepEqual(
            stateQuestions.map((q) => q.id),
            ['q-old', 'q-retry'],
        );
    });

    it('13. importQuestionsApi rejeita respostas 2xx malformadas ou inválidas com InvalidImportResponseError sem corromper o estado e permite retry', async () => {
        const originalFetch = globalThis.fetch;
        const baseValid = makeApiQuestion('q-1', 'Enunciado válido');

        const malformedResponses: unknown[] = [
            null,
            'texto',
            [],
            {},
            { questions: 'nao-array' },
            {
                // Sem ID
                questions: [{ ...baseValid, id: undefined }],
            },
            {
                // ID vazio
                questions: [{ ...baseValid, id: '   ' }],
            },
            {
                // statement inválido
                questions: [{ ...baseValid, statement: '   ' }],
            },
            {
                // type inválido
                questions: [{ ...baseValid, type: 'ESSAY' }],
            },
            {
                // options ausente
                questions: [{ ...baseValid, options: undefined }],
            },
            {
                // options inválido (< 2)
                questions: [{ ...baseValid, options: [baseValid.options[0]] }],
            },
            {
                // item de opção malformado
                questions: [
                    {
                        ...baseValid,
                        options: [
                            { id: '', text: 'A', isCorrect: true, position: 0, questionId: 'q-1' },
                            baseValid.options[1],
                        ],
                    },
                ],
            },
        ];

        const existing = [makeModelQuestion('q-old', 'Prévia')];
        let stateQuestions = [...existing];
        const tracker = createQuestionImportTracker('room-1');

        try {
            for (const body of malformedResponses) {
                globalThis.fetch = (async () =>
                    new Response(JSON.stringify(body), {
                        status: 201,
                        headers: { 'Content-Type': 'application/json' },
                    })) as typeof fetch;

                await assert.rejects(
                    () => importQuestionsApi('room-1', [sampleBatch[0]!]),
                    InvalidImportResponseError,
                );

                const batchRes = await executeImportQuestionsBatch({
                    roomId: 'room-1',
                    questions: [sampleBatch[0]!],
                    tracker,
                    getCurrentQuestions: () => stateQuestions,
                    requestImport: importQuestionsApi,
                    onApplyQuestions: (next) => {
                        stateQuestions = next;
                    },
                });

                assert.equal(batchRes.success, false);
                if (!batchRes.success) {
                    assert.equal(batchRes.status, 'INVALID_RESPONSE');
                }
                assert.deepEqual(
                    stateQuestions.map((q) => q.id),
                    ['q-old'],
                );
            }

            // Resposta 2xx com array vazio não é tratada como sucesso
            globalThis.fetch = (async () =>
                new Response(
                    JSON.stringify({
                        message: 'ok',
                        importedCount: 1,
                        questions: [],
                    }),
                    { status: 201, headers: { 'Content-Type': 'application/json' } },
                )) as typeof fetch;

            const emptyRes = await executeImportQuestionsBatch({
                roomId: 'room-1',
                questions: sampleBatch,
                tracker,
                getCurrentQuestions: () => stateQuestions,
                requestImport: importQuestionsApi,
                onApplyQuestions: (next) => {
                    stateQuestions = next;
                },
            });

            assert.equal(emptyRes.success, false);
            if (!emptyRes.success) {
                assert.equal(emptyRes.status, 'EMPTY_RESPONSE');
                assert.equal(emptyRes.addedCount, 0);
            }
            assert.deepEqual(
                stateQuestions.map((q) => q.id),
                ['q-old'],
            );

            // Retry após respostas inválidas e vazia com payload válido funciona
            globalThis.fetch = (async () =>
                new Response(
                    JSON.stringify({
                        message: 'ok',
                        importedCount: 1,
                        questions: [makeApiQuestion('q-ok', 'Recuperada')],
                    }),
                    { status: 201, headers: { 'Content-Type': 'application/json' } },
                )) as typeof fetch;

            const retryOk = await executeImportQuestionsBatch({
                roomId: 'room-1',
                questions: [sampleBatch[0]!],
                tracker,
                getCurrentQuestions: () => stateQuestions,
                requestImport: importQuestionsApi,
                onApplyQuestions: (next) => {
                    stateQuestions = next;
                },
            });
            assert.equal(retryOk.success, true);
            assert.deepEqual(
                stateQuestions.map((q) => q.id),
                ['q-old', 'q-ok'],
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('14. contagem e deduplicação diferenciam COMPLETED, PARTIAL, IDs duplicados e perguntas já existentes no estado', async () => {
        const existing = [
            makeModelQuestion('q-existing', 'Já no estado', 'MULTIPLE_CHOICE', true),
            makeModelQuestion('q-inactive', 'Inativa', 'MULTIPLE_CHOICE', false),
        ];
        let stateQuestions = [...existing];
        const tracker = createQuestionImportTracker('room-1');

        // Caso A: enviadas 3, API devolve 2 distintas -> PARTIAL com addedCount = 2
        const partialRes = await executeImportQuestionsBatch({
            roomId: 'room-1',
            questions: [sampleBatch[0]!, sampleBatch[1]!, sampleBatch[0]!],
            tracker,
            getCurrentQuestions: () => stateQuestions,
            requestImport: async () => ({
                message: 'ok',
                importedCount: 3, // divergente propositalmente; não deve ser confiado
                questions: [
                    makeModelQuestion('q-new-1', 'Nova 1'),
                    makeModelQuestion('q-new-2', 'Nova 2', 'TRUE_FALSE'),
                ],
            }),
            onApplyQuestions: (next) => {
                stateQuestions = next;
            },
        });

        assert.equal(partialRes.success, true);
        if (partialRes.success) {
            assert.equal(partialRes.status, 'PARTIAL');
            assert.equal(partialRes.requestedCount, 3);
            assert.equal(partialRes.receivedCount, 2);
            assert.equal(partialRes.addedCount, 2);
            assert.equal(partialRes.importedCount, 2);
        }
        assert.deepEqual(
            stateQuestions.map((q) => q.id),
            ['q-existing', 'q-inactive', 'q-new-1', 'q-new-2'],
        );

        // Caso B: resposta traz ID duplicado na própria lista + ID já existente no estado
        // Recebidas 3 entradas [q-new-1 (já existente), q-dup, q-dup] -> apenas 1 realmente adicionada!
        const dupStats = mergeImportedQuestionsWithStats(stateQuestions, [
            makeModelQuestion('q-new-1', 'Nova 1'),
            makeModelQuestion('q-dup', 'Única nova'),
            makeModelQuestion('q-dup', 'Única nova duplicada'),
        ]);
        assert.equal(dupStats.duplicateInResponseCount, 1);
        assert.equal(dupStats.alreadyExistingCount, 1);
        assert.equal(dupStats.uniqueReceivedCount, 2);
        assert.equal(dupStats.addedCount, 1);

        const dupBatchRes = await executeImportQuestionsBatch({
            roomId: 'room-1',
            questions: sampleBatch,
            tracker,
            getCurrentQuestions: () => stateQuestions,
            requestImport: async () => ({
                message: 'ok',
                importedCount: 3,
                questions: [
                    makeModelQuestion('q-new-1', 'Nova 1'),
                    makeModelQuestion('q-dup', 'Única nova'),
                    makeModelQuestion('q-dup', 'Única nova duplicada'),
                ],
            }),
            onApplyQuestions: (next) => {
                stateQuestions = next;
            },
        });

        assert.equal(dupBatchRes.success, true);
        if (dupBatchRes.success) {
            assert.equal(dupBatchRes.status, 'PARTIAL');
            assert.equal(dupBatchRes.requestedCount, 2);
            assert.equal(dupBatchRes.receivedCount, 2);
            assert.equal(dupBatchRes.addedCount, 1);
            assert.equal(dupBatchRes.importedCount, 1);
        }

        // Caso C: todas enviadas retornadas distintas e novas -> COMPLETED
        const fullRes = await executeImportQuestionsBatch({
            roomId: 'room-1',
            questions: sampleBatch,
            tracker,
            getCurrentQuestions: () => stateQuestions,
            requestImport: async () => ({
                message: 'ok',
                importedCount: 2,
                questions: [
                    makeModelQuestion('q-full-1', 'Completa 1'),
                    makeModelQuestion('q-full-2', 'Completa 2', 'TRUE_FALSE'),
                ],
            }),
            onApplyQuestions: (next) => {
                stateQuestions = next;
            },
        });

        assert.equal(fullRes.success, true);
        if (fullRes.success) {
            assert.equal(fullRes.status, 'COMPLETED');
            assert.equal(fullRes.addedCount, 2);
            assert.equal(fullRes.requestedCount, 2);
        }

        // Contagem ativa continua derivada exclusivamente do estado final de questions
        const derivedActiveCount = stateQuestions.filter((q) => q.isActive).length;
        assert.equal(derivedActiveCount, 6);
    });
});

describe('Etapa 2.3 — Interface e fluxo do modal de importação JSON', () => {
    it('15. paginatePreviewItems pagina lotes grandes (10 por página) e limita páginas inválidas', () => {
        const items: QuestionImportPreviewItem[] = Array.from(
            { length: 25 },
            (_, idx) => ({
                questionNumber: idx + 1,
                duplicateInRoom: idx % 7 === 0,
                question: {
                    statement: `Questão ${idx + 1}`,
                    type: 'MULTIPLE_CHOICE',
                    options: [
                        { text: 'A', isCorrect: true },
                        { text: 'B', isCorrect: false },
                    ],
                },
            }),
        );

        assert.equal(PREVIEW_PAGE_SIZE, 10);

        const page1 = paginatePreviewItems(items, 1);
        assert.equal(page1.totalPages, 3);
        assert.equal(page1.startIndex, 0);
        assert.equal(page1.endIndex, 10);
        assert.equal(page1.items.length, 10);
        assert.equal(page1.hasPrevious, false);
        assert.equal(page1.hasNext, true);

        const page3 = paginatePreviewItems(items, 99);
        assert.equal(page3.currentPage, 3);
        assert.equal(page3.startIndex, 20);
        assert.equal(page3.endIndex, 25);
        assert.equal(page3.items.length, 5);
        assert.equal(page3.hasPrevious, true);
        assert.equal(page3.hasNext, false);

        const page0 = paginatePreviewItems(items, 0);
        assert.equal(page0.currentPage, 1);

        assert.equal(formatImportFileSize(512), '512 B');
        assert.equal(formatImportFileSize(2048), '2.0 KB');
    });

    it('16. estado do modal valida arquivo, recalcula duplicatas quando a sala muda, bloqueia confirmação inválida e permite retry preservando preview', () => {
        const initial = createInitialImportModalState();
        assert.equal(
            canConfirmImportState({
                state: initial,
                roomId: 'room-1',
                roomStatus: 'WAITING',
                isImporting: false,
            }),
            false,
        );

        const invalidState = applyValidatedJsonTextToModalState(
            { name: 'ruim.json', size: 30, type: 'application/json' },
            '{"questions": []}',
            [],
        );
        assert.equal(invalidState.validation?.valid, false);
        assert.equal(
            canConfirmImportState({
                state: invalidState,
                roomId: 'room-1',
                roomStatus: 'WAITING',
                isImporting: false,
            }),
            false,
        );

        const validJson = JSON.stringify({
            questions: [
                {
                    statement: 'Qual porta HTTPS?',
                    type: 'MULTIPLE_CHOICE',
                    options: [
                        { text: '80', isCorrect: false },
                        { text: '443', isCorrect: true },
                    ],
                },
            ],
        });

        const readyState = applyValidatedJsonTextToModalState(
            { name: 'quiz.json', size: 180, type: 'application/json' },
            validJson,
            [],
        );
        assert.equal(readyState.validation?.valid, true);
        if (readyState.validation?.valid) {
            assert.equal(readyState.validation.warnings.length, 0);
        }
        assert.equal(
            canConfirmImportState({
                state: readyState,
                roomId: 'room-1',
                roomStatus: 'WAITING',
                isImporting: false,
            }),
            true,
        );

        // Recálculo dinâmico quando uma pergunta igual já existe na sala
        const updatedWithDuplicate = recomputeImportStateDuplicates(
            readyState,
            [{ statement: '  QUAL PORTA HTTPS? ' }],
        );
        assert.equal(updatedWithDuplicate.validation?.valid, true);
        if (updatedWithDuplicate.validation?.valid) {
            assert.equal(updatedWithDuplicate.validation.warnings.length, 1);
            assert.equal(
                updatedWithDuplicate.validation.previewItems[0]
                    ?.duplicateInRoom,
                true,
            );
        }

        // Sala não WAITING ou importação em curso bloqueiam confirmação e fechamento
        assert.equal(
            canConfirmImportState({
                state: updatedWithDuplicate,
                roomId: 'room-1',
                roomStatus: 'IN_PROGRESS',
                isImporting: false,
            }),
            false,
        );
        assert.equal(
            canConfirmImportState({
                state: updatedWithDuplicate,
                roomId: 'room-1',
                roomStatus: 'WAITING',
                isImporting: true,
            }),
            false,
        );
        assert.equal(canCloseImportModal(true), false);
        assert.equal(canCloseImportModal(false), true);

        // Falha de API permite retry mantendo arquivo e preview; COMPLETED bloqueia reenvio do mesmo lote
        const afterApiError = {
            ...updatedWithDuplicate,
            outcome: describeImportOutcome({
                success: false,
                status: 'API_ERROR',
                requestedCount: 1,
                receivedCount: 0,
                addedCount: 0,
                importedCount: 0,
                error: 'Erro temporário.',
                httpStatus: 500,
            }),
        };
        assert.equal(afterApiError.selectedFile?.name, 'quiz.json');
        assert.equal(afterApiError.outcome?.canRetry, true);
        assert.equal(
            canConfirmImportState({
                state: afterApiError,
                roomId: 'room-1',
                roomStatus: 'WAITING',
                isImporting: false,
            }),
            true,
        );

        const afterCompleted = {
            ...updatedWithDuplicate,
            outcome: describeImportOutcome({
                success: true,
                status: 'COMPLETED',
                requestedCount: 1,
                receivedCount: 1,
                addedCount: 1,
                importedCount: 1,
                questions: [],
            }),
        };
        assert.equal(
            canConfirmImportState({
                state: afterCompleted,
                roomId: 'room-1',
                roomStatus: 'WAITING',
                isImporting: false,
            }),
            false,
        );
    });

    it('17. describeImportOutcome diferencia todos os 8 status sem inventar contagem', () => {
        const completed = describeImportOutcome({
            success: true,
            status: 'COMPLETED',
            requestedCount: 5,
            receivedCount: 5,
            addedCount: 5,
            importedCount: 5,
            questions: [],
        });
        assert.equal(completed.tone, 'success');
        assert.equal(completed.canFinish, true);
        assert.match(completed.message, /5 perguntas importadas/i);

        const partial = describeImportOutcome({
            success: true,
            status: 'PARTIAL',
            requestedCount: 10,
            receivedCount: 7,
            addedCount: 7,
            importedCount: 7,
            questions: [],
        });
        assert.equal(partial.tone, 'warning');
        assert.equal(partial.canFinish, true);
        assert.match(partial.message, /7 de 10/);

        const empty = describeImportOutcome({
            success: false,
            status: 'EMPTY_RESPONSE',
            requestedCount: 3,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'O servidor não retornou novas perguntas para adicionar à sala.',
        });
        assert.equal(empty.tone, 'error');
        assert.equal(empty.canRetry, true);

        const invalid = describeImportOutcome({
            success: false,
            status: 'INVALID_RESPONSE',
            requestedCount: 3,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Resposta inválida.',
        });
        assert.equal(invalid.tone, 'error');
        assert.equal(invalid.canRetry, true);

        const apiErr = describeImportOutcome({
            success: false,
            status: 'API_ERROR',
            requestedCount: 2,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Erro 1',
            fieldErrors: { a: 'Erro 1', b: 'Erro 2' },
        });
        assert.deepEqual(apiErr.fieldErrorMessages, ['Erro 1', 'Erro 2']);
        assert.equal(apiErr.canRetry, true);

        const inProgress = describeImportOutcome({
            success: false,
            status: 'ALREADY_IMPORTING',
            requestedCount: 2,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Importação já em andamento.',
        });
        assert.equal(inProgress.tone, 'warning');
        assert.equal(inProgress.canRetry, false);

        const noRoom = describeImportOutcome({
            success: false,
            status: 'NO_ACTIVE_ROOM',
            requestedCount: 2,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Sem sala.',
        });
        assert.equal(noRoom.tone, 'error');
        assert.equal(noRoom.canRetry, false);

        const stale = describeImportOutcome({
            success: false,
            status: 'STALE_ROOM',
            requestedCount: 2,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Sala alterada.',
        });
        assert.equal(stale.tone, 'warning');
        assert.equal(stale.canRetry, false);
    });

    it('18. DashboardForm integra botão Importar JSON apenas em WAITING ao lado do cadastro manual e monta único ImportQuestionsModal', () => {
        const dashboardSource = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../src/features/Dashboard/components/DashboardForm.tsx',
            ),
            'utf8',
        );
        const modalSource = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../src/views/Dashboard/ImportQuestionsModal/ImportQuestionsModal.tsx',
            ),
            'utf8',
        );

        const importBtnMatches = dashboardSource.match(/Importar JSON/g) ?? [];
        assert.equal(importBtnMatches.length, 1);

        const modalTagMatches =
            dashboardSource.match(/<ImportQuestionsModal/g) ?? [];
        assert.equal(modalTagMatches.length, 1);

        assert.match(dashboardSource, /questionBank\.openImport/);
        assert.match(dashboardSource, /isOpen=\{questionBank\.isImportOpen\}/);
        assert.match(
            dashboardSource,
            /onImportBatch=\{questionBank\.importQuestionsBatch\}/,
        );
        assert.match(dashboardSource, /\+ Cadastrar Pergunta/);

        assert.match(modalSource, /canCloseImportModal\(vmParams\.isImporting\)/);
        assert.match(modalSource, /accept="\.json,application\/json"/);
    });
});
