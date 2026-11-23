import {
    MAX_CHOICES,
    MIN_CHOICES,
    OPTION_MAX_LENGTH,
    STATEMENT_MAX_LENGTH,
    TRUE_FALSE_STANDARD_OPTIONS,
    type Question,
    type QuestionType,
} from './question.ts';

export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
export const MIN_IMPORT_QUESTIONS = 1;
export const MAX_IMPORT_QUESTIONS = 100;

export interface ImportQuestionOptionInput {
    text: string;
    isCorrect: boolean;
}

export interface ImportQuestionInput {
    statement: string;
    type: QuestionType;
    options: ImportQuestionOptionInput[];
}

export type QuestionImportErrorField =
    | 'file'
    | 'root'
    | 'questions'
    | 'statement'
    | 'type'
    | 'options';

export interface QuestionImportErrorItem {
    questionNumber: number | null;
    field: QuestionImportErrorField;
    message: string;
}

export interface QuestionImportDuplicateWarning {
    questionNumber: number;
    statement: string;
    message: string;
}

export interface QuestionImportPreviewItem {
    questionNumber: number;
    question: ImportQuestionInput;
    duplicateInRoom: boolean;
}

export interface QuestionImportFileMetaInput {
    name: string;
    size: number;
    type?: string;
}

export type FileMetaValidationResult =
    | { valid: true }
    | { valid: false; errors: QuestionImportErrorItem[] };

export type QuestionImportValidationResult =
    | {
        valid: true;
        questions: ImportQuestionInput[];
        previewItems: QuestionImportPreviewItem[];
        warnings: QuestionImportDuplicateWarning[];
    }
    | {
        valid: false;
        errors: QuestionImportErrorItem[];
    };

const VALID_QUESTION_TYPES: readonly QuestionType[] = [
    'MULTIPLE_CHOICE',
    'TRUE_FALSE',
];

/** Normaliza textos para comparação de duplicatas (trim + case-insensitive). */
export function normalizeComparisonText(value: string): string {
    return value.trim().toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valida metadados básicos do arquivo antes da leitura do conteúdo. */
export function validateImportFileMeta(
    file: QuestionImportFileMetaInput,
): FileMetaValidationResult {
    const errors: QuestionImportErrorItem[] = [];
    const normalizedName = file.name.trim().toLowerCase();
    const isJsonExtension = normalizedName.endsWith('.json');
    const isJsonMime = file.type === 'application/json';

    if (!isJsonExtension && !isJsonMime) {
        errors.push({
            questionNumber: null,
            field: 'file',
            message: 'Selecione um arquivo no formato .json.',
        });
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
        errors.push({
            questionNumber: null,
            field: 'file',
            message: 'O arquivo selecionado está vazio.',
        });
    } else if (file.size > MAX_IMPORT_FILE_BYTES) {
        errors.push({
            questionNumber: null,
            field: 'file',
            message: 'O arquivo excede o limite máximo de 1 MB.',
        });
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function validateImportQuestionItem(
    rawItem: unknown,
    index: number,
): {
    question: ImportQuestionInput | null;
    normalizedStatement: string | null;
    errors: QuestionImportErrorItem[];
} {
    const questionNumber = index + 1;
    const errors: QuestionImportErrorItem[] = [];

    if (!isPlainObject(rawItem)) {
        return {
            question: null,
            normalizedStatement: null,
            errors: [
                {
                    questionNumber,
                    field: 'root',
                    message: `Pergunta ${questionNumber}: deve ser um objeto JSON.`,
                },
            ],
        };
    }

    let resolvedStatement = '';
    if (typeof rawItem.statement !== 'string') {
        errors.push({
            questionNumber,
            field: 'statement',
            message: `Pergunta ${questionNumber}: o enunciado é obrigatório e deve ser um texto.`,
        });
    } else {
        resolvedStatement = rawItem.statement.trim();
        if (!resolvedStatement) {
            errors.push({
                questionNumber,
                field: 'statement',
                message: `Pergunta ${questionNumber}: o enunciado é obrigatório.`,
            });
        } else if (resolvedStatement.length > STATEMENT_MAX_LENGTH) {
            errors.push({
                questionNumber,
                field: 'statement',
                message: `Pergunta ${questionNumber}: o enunciado deve ter no máximo ${STATEMENT_MAX_LENGTH} caracteres.`,
            });
        }
    }

    let resolvedType: QuestionType = 'MULTIPLE_CHOICE';
    let hasValidType = true;
    if (rawItem.type !== undefined) {
        if (
            typeof rawItem.type !== 'string' ||
            !VALID_QUESTION_TYPES.includes(rawItem.type as QuestionType)
        ) {
            hasValidType = false;
            errors.push({
                questionNumber,
                field: 'type',
                message: `Pergunta ${questionNumber}: o tipo deve ser MULTIPLE_CHOICE ou TRUE_FALSE.`,
            });
        } else {
            resolvedType = rawItem.type as QuestionType;
        }
    }

    const normalizedOptions: ImportQuestionOptionInput[] = [];

    if (!Array.isArray(rawItem.options)) {
        errors.push({
            questionNumber,
            field: 'options',
            message: `Pergunta ${questionNumber}: as alternativas devem ser informadas em uma lista.`,
        });
    } else if (hasValidType) {
        if (
            resolvedType === 'TRUE_FALSE'
                ? rawItem.options.length !== 2
                : rawItem.options.length < MIN_CHOICES ||
                  rawItem.options.length > MAX_CHOICES
        ) {
            errors.push({
                questionNumber,
                field: 'options',
                message:
                    resolvedType === 'TRUE_FALSE'
                        ? `Pergunta ${questionNumber}: perguntas de verdadeiro ou falso devem possuir exatamente 2 alternativas.`
                        : `Pergunta ${questionNumber}: perguntas de múltipla escolha devem possuir entre ${MIN_CHOICES} e ${MAX_CHOICES} alternativas.`,
            });
        } else {
            let optionHasError = false;

            for (let optIdx = 0; optIdx < rawItem.options.length; optIdx += 1) {
                const rawOption = rawItem.options[optIdx];

                if (!isPlainObject(rawOption)) {
                    optionHasError = true;
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: a alternativa ${optIdx + 1} deve ser um objeto com "text" e "isCorrect".`,
                    });
                    break;
                }

                const trimmedText =
                    typeof rawOption.text === 'string'
                        ? rawOption.text.trim()
                        : '';

                if (typeof rawOption.text !== 'string' || !trimmedText) {
                    optionHasError = true;
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: o texto da alternativa ${optIdx + 1} é obrigatório.`,
                    });
                    break;
                }

                if (trimmedText.length > OPTION_MAX_LENGTH) {
                    optionHasError = true;
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: a alternativa ${optIdx + 1} deve ter no máximo ${OPTION_MAX_LENGTH} caracteres.`,
                    });
                    break;
                }

                if (typeof rawOption.isCorrect !== 'boolean') {
                    optionHasError = true;
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: "isCorrect" da alternativa ${optIdx + 1} deve ser booleano.`,
                    });
                    break;
                }

                normalizedOptions.push({
                    text: trimmedText,
                    isCorrect: rawOption.isCorrect,
                });
            }

            if (!optionHasError) {
                const optionKeys = normalizedOptions.map((opt) =>
                    normalizeComparisonText(opt.text),
                );
                if (new Set(optionKeys).size !== optionKeys.length) {
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: as alternativas não podem se repetir.`,
                    });
                } else if (
                    resolvedType === 'TRUE_FALSE' &&
                    !TRUE_FALSE_STANDARD_OPTIONS.every((label) =>
                        normalizedOptions.some((opt) => opt.text === label),
                    )
                ) {
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: perguntas de verdadeiro ou falso devem usar as alternativas padronizadas "Verdadeiro" e "Falso".`,
                    });
                } else if (
                    normalizedOptions.filter((opt) => opt.isCorrect).length !== 1
                ) {
                    errors.push({
                        questionNumber,
                        field: 'options',
                        message: `Pergunta ${questionNumber}: deve possuir exatamente 1 alternativa correta.`,
                    });
                }
            }
        }
    }

    const normalizedStatement = resolvedStatement
        ? normalizeComparisonText(resolvedStatement)
        : null;

    if (errors.length > 0) {
        return {
            question: null,
            normalizedStatement,
            errors,
        };
    }

    return {
        question: {
            statement: resolvedStatement,
            type: resolvedType,
            options: normalizedOptions,
        },
        normalizedStatement,
        errors: [],
    };
}

/**
 * Compara enunciados do lote com perguntas já cadastradas na sala para gerar avisos
 * não bloqueantes no preview (trim + case-insensitive).
 */
export function findRoomStatementDuplicates(
    questions: readonly ImportQuestionInput[],
    existingQuestions: readonly Pick<Question, 'statement'>[],
): {
    previewItems: QuestionImportPreviewItem[];
    warnings: QuestionImportDuplicateWarning[];
} {
    const existingStatements = new Set(
        existingQuestions.map((question) =>
            normalizeComparisonText(question.statement),
        ),
    );
    const warnings: QuestionImportDuplicateWarning[] = [];

    const previewItems = questions.map((question, index) => {
        const questionNumber = index + 1;
        const duplicateInRoom = existingStatements.has(
            normalizeComparisonText(question.statement),
        );

        if (duplicateInRoom) {
            warnings.push({
                questionNumber,
                statement: question.statement,
                message: `Pergunta ${questionNumber}: enunciado já existe nesta sala e será acrescentado novamente se importado.`,
            });
        }

        return {
            questionNumber,
            question,
            duplicateInRoom,
        };
    });

    return { previewItems, warnings };
}

/**
 * Valida o objeto já parseado de importação contra o contrato oficial `{ questions: [...] }`.
 * Valida todas as perguntas antes de concluir, sem aceitar formatos alternativos.
 */
export function validateImportPayload(
    payload: unknown,
    existingQuestions: readonly Pick<Question, 'statement'>[] = [],
): QuestionImportValidationResult {
    if (!isPlainObject(payload)) {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'root',
                    message:
                        'A estrutura raiz do JSON deve ser um objeto contendo o campo "questions".',
                },
            ],
        };
    }

    if (!Array.isArray(payload.questions)) {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'questions',
                    message:
                        'O campo "questions" é obrigatório e deve ser uma lista de perguntas.',
                },
            ],
        };
    }

    if (payload.questions.length < MIN_IMPORT_QUESTIONS) {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'questions',
                    message:
                        'O arquivo JSON deve conter pelo menos 1 pergunta.',
                },
            ],
        };
    }

    if (payload.questions.length > MAX_IMPORT_QUESTIONS) {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'questions',
                    message: `Cada importação aceita no máximo ${MAX_IMPORT_QUESTIONS} perguntas.`,
                },
            ],
        };
    }

    const errors: QuestionImportErrorItem[] = [];
    const validatedQuestions: ImportQuestionInput[] = [];
    const seenStatements = new Map<string, number>();

    for (let index = 0; index < payload.questions.length; index += 1) {
        const itemResult = validateImportQuestionItem(
            payload.questions[index],
            index,
        );

        if (itemResult.errors.length > 0) {
            errors.push(...itemResult.errors);
        }

        if (itemResult.normalizedStatement) {
            const firstOccurrence = seenStatements.get(
                itemResult.normalizedStatement,
            );

            if (firstOccurrence !== undefined) {
                errors.push({
                    questionNumber: index + 1,
                    field: 'statement',
                    message: `Pergunta ${index + 1}: enunciado duplicado em relação à pergunta ${firstOccurrence}.`,
                });
            } else {
                seenStatements.set(itemResult.normalizedStatement, index + 1);
            }
        }

        if (itemResult.question) {
            validatedQuestions.push(itemResult.question);
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    const { previewItems, warnings } = findRoomStatementDuplicates(
        validatedQuestions,
        existingQuestions,
    );

    return {
        valid: true,
        questions: validatedQuestions,
        previewItems,
        warnings,
    };
}

/**
 * Interpreta uma string JSON bruta e valida todo o lote contra as regras oficiais.
 */
export function parseAndValidateImportJson(
    rawText: string,
    existingQuestions: readonly Pick<Question, 'statement'>[] = [],
): QuestionImportValidationResult {
    if (!rawText.trim()) {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'file',
                    message: 'O arquivo JSON está vazio.',
                },
            ],
        };
    }

    if (new TextEncoder().encode(rawText).length > MAX_IMPORT_FILE_BYTES) {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'file',
                    message: 'O conteúdo JSON excede o limite máximo de 1 MB.',
                },
            ],
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        return {
            valid: false,
            errors: [
                {
                    questionNumber: null,
                    field: 'root',
                    message:
                        'Arquivo inválido: o conteúdo não é um JSON válido.',
                },
            ],
        };
    }

    return validateImportPayload(parsed, existingQuestions);
}

export interface ImportQuestionsBatchResponse {
    message: string;
    importedCount: number;
    questions: Question[];
}

export type ImportQuestionsResultStatus =
    | 'COMPLETED'
    | 'PARTIAL'
    | 'EMPTY_RESPONSE'
    | 'INVALID_RESPONSE'
    | 'API_ERROR'
    | 'ALREADY_IMPORTING'
    | 'NO_ACTIVE_ROOM'
    | 'STALE_ROOM';

export type ImportQuestionsExecutionResult =
    | {
        success: true;
        status: 'COMPLETED' | 'PARTIAL';
        requestedCount: number;
        receivedCount: number;
        addedCount: number;
        importedCount: number;
        questions: Question[];
    }
    | {
        success: false;
        status:
            | 'EMPTY_RESPONSE'
            | 'INVALID_RESPONSE'
            | 'API_ERROR'
            | 'ALREADY_IMPORTING'
            | 'NO_ACTIVE_ROOM'
            | 'STALE_ROOM';
        requestedCount: number;
        receivedCount: number;
        addedCount: 0;
        importedCount: 0;
        error: string;
        httpStatus?: number;
        fieldErrors?: Record<string, string>;
    };

/** Erro explícito para respostas 2xx do backend fora do contrato esperado. */
export class InvalidImportResponseError extends Error {
    constructor(
        message = 'O servidor retornou uma resposta inválida ao importar perguntas.',
    ) {
        super(message);
        this.name = 'InvalidImportResponseError';
    }
}

export interface QuestionImportOperationTracker {
    activeRoomId: string | null;
    inFlightByRoomId: Record<string, number>;
    requestSeq: number;
}

export function createQuestionImportTracker(
    initialRoomId: string | null = null,
): QuestionImportOperationTracker {
    return {
        activeRoomId: initialRoomId,
        inFlightByRoomId: {},
        requestSeq: 0,
    };
}

export function isRoomImporting(
    tracker: QuestionImportOperationTracker,
    roomId: string | null,
): boolean {
    if (!roomId || !roomId.trim()) return false;
    return tracker.inFlightByRoomId[roomId.trim()] !== undefined;
}

/**
 * Atualiza a sala ativa no rastreador e sincroniza o indicador de loading
 * exclusivamente para a sala exibida no momento.
 */
export function syncQuestionImportRoom(
    tracker: QuestionImportOperationTracker,
    nextRoomId: string | null,
    onImportingChange?: (isImporting: boolean) => void,
): void {
    tracker.activeRoomId = nextRoomId;
    onImportingChange?.(isRoomImporting(tracker, nextRoomId));
}

interface HttpErrorLike {
    status: number;
    message?: string;
    errors?: Record<string, string>;
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        'status' in value &&
        typeof (value as { status: unknown }).status === 'number'
    );
}

/**
 * Converte erros da API de importação em mensagens amigáveis,
 * preservando status HTTP e erros detalhados por campo quando disponíveis.
 */
export function formatImportQuestionsError(error: unknown): {
    message: string;
    httpStatus?: number;
    fieldErrors?: Record<string, string>;
} {
    if (isHttpErrorLike(error)) {
        if (error.status === 400) {
            const fieldErrors = error.errors;
            const firstFieldError = fieldErrors
                ? Object.values(fieldErrors).find((msg) => Boolean(msg?.trim()))
                : undefined;

            return {
                message:
                    firstFieldError ??
                    error.message ??
                    'Dados de importação inválidos.',
                httpStatus: 400,
                ...(fieldErrors && { fieldErrors }),
            };
        }

        if (error.status === 401 || error.status === 403) {
            return {
                message:
                    'Sua sessão expirou ou você não tem permissão para importar perguntas nesta sala.',
                httpStatus: error.status,
            };
        }

        if (error.status === 404) {
            return {
                message: 'Sala não encontrada.',
                httpStatus: 404,
            };
        }

        if (error.status === 409) {
            return {
                message:
                    error.message ||
                    'Não é possível importar perguntas após o início da partida ou em sala arquivada.',
                httpStatus: 409,
            };
        }

        if (error.status === 413) {
            return {
                message:
                    error.message ||
                    'O arquivo JSON excede o limite máximo de 1 MB permitido pelo servidor.',
                httpStatus: 413,
            };
        }

        if (error.status >= 500) {
            return {
                message:
                    'Não foi possível importar as perguntas devido a uma falha no servidor. Tente novamente em instantes.',
                httpStatus: error.status,
            };
        }

        return {
            message:
                error.message ||
                'Não foi possível importar as perguntas. Tente novamente.',
            httpStatus: error.status,
        };
    }

    if (error instanceof Error) {
        const msg = error.message || '';
        if (
            msg.includes('Não foi possível conectar ao servidor') ||
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError')
        ) {
            return {
                message:
                    'Não foi possível conectar ao servidor. Verifique sua conexão.',
            };
        }

        if (msg.trim()) {
            return { message: msg };
        }
    }

    return {
        message: 'Não foi possível importar as perguntas. Tente novamente.',
    };
}

export interface MergeImportedQuestionsResult {
    questions: Question[];
    addedQuestions: Question[];
    addedCount: number;
    uniqueReceivedCount: number;
    duplicateInResponseCount: number;
    alreadyExistingCount: number;
}

/**
 * Acrescenta perguntas importadas ao final das existentes de forma idempotente,
 * deduplicando tanto em relação ao estado atual quanto duplicatas dentro da própria resposta.
 */
export function mergeImportedQuestionsWithStats(
    existing: readonly Question[],
    imported: readonly Question[],
): MergeImportedQuestionsResult {
    const existingIds = new Set(existing.map((question) => question.id));
    const responseSeenIds = new Set<string>();
    const merged = [...existing];
    const addedQuestions: Question[] = [];

    let uniqueReceivedCount = 0;
    let duplicateInResponseCount = 0;
    let alreadyExistingCount = 0;

    for (const question of imported) {
        if (responseSeenIds.has(question.id)) {
            duplicateInResponseCount += 1;
            continue;
        }
        responseSeenIds.add(question.id);
        uniqueReceivedCount += 1;

        if (existingIds.has(question.id)) {
            alreadyExistingCount += 1;
            continue;
        }

        existingIds.add(question.id);
        merged.push(question);
        addedQuestions.push(question);
    }

    return {
        questions: merged,
        addedQuestions,
        addedCount: addedQuestions.length,
        uniqueReceivedCount,
        duplicateInResponseCount,
        alreadyExistingCount,
    };
}

/** Versão simplificada que retorna apenas o novo array mesclado. */
export function mergeImportedQuestions(
    existing: readonly Question[],
    imported: readonly Question[],
): Question[] {
    return mergeImportedQuestionsWithStats(existing, imported).questions;
}

export interface ExecuteImportQuestionsDependencies {
    roomId: string | null;
    questions: readonly ImportQuestionInput[];
    tracker: QuestionImportOperationTracker;
    getCurrentQuestions: () => readonly Question[];
    requestImport: (
        roomId: string,
        questions: readonly ImportQuestionInput[],
    ) => Promise<ImportQuestionsBatchResponse>;
    onImportingChange?: (isImporting: boolean) => void;
    onApplyQuestions: (nextQuestions: Question[], targetRoomId: string) => void;
}

/**
 * Orquestra o envio do lote validado com isolamento por sala/operação, trava síncrona
 * contra submissões duplicadas na mesma sala e diferenciação entre sucesso completo,
 * parcial, resposta vazia e resposta inválida.
 */
export async function executeImportQuestionsBatch(
    deps: ExecuteImportQuestionsDependencies,
): Promise<ImportQuestionsExecutionResult> {
    const requestedCount = deps.questions.length;

    if (!deps.roomId || !deps.roomId.trim()) {
        return {
            success: false,
            status: 'NO_ACTIVE_ROOM',
            requestedCount,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Selecione ou crie uma sala antes de importar perguntas.',
        };
    }

    const targetRoomId = deps.roomId.trim();

    if (deps.tracker.inFlightByRoomId[targetRoomId] !== undefined) {
        return {
            success: false,
            status: 'ALREADY_IMPORTING',
            requestedCount,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: 'Uma importação já está em andamento para esta sala.',
        };
    }

    const opSeq = ++deps.tracker.requestSeq;
    deps.tracker.inFlightByRoomId[targetRoomId] = opSeq;

    if (deps.tracker.activeRoomId === targetRoomId) {
        deps.onImportingChange?.(true);
    }

    try {
        const response = await deps.requestImport(
            targetRoomId,
            deps.questions,
        );

        if (!response || !Array.isArray(response.questions)) {
            throw new InvalidImportResponseError();
        }

        const isActiveRoom = deps.tracker.activeRoomId === targetRoomId;
        const isCurrentOp =
            deps.tracker.inFlightByRoomId[targetRoomId] === opSeq;

        if (!isActiveRoom || !isCurrentOp) {
            return {
                success: false,
                status: 'STALE_ROOM',
                requestedCount,
                receivedCount: 0,
                addedCount: 0,
                importedCount: 0,
                error: 'A sala ativa mudou antes da conclusão da importação.',
            };
        }

        const mergeResult = mergeImportedQuestionsWithStats(
            deps.getCurrentQuestions(),
            response.questions,
        );

        if (mergeResult.addedCount === 0) {
            return {
                success: false,
                status: 'EMPTY_RESPONSE',
                requestedCount,
                receivedCount: mergeResult.uniqueReceivedCount,
                addedCount: 0,
                importedCount: 0,
                error: 'O servidor não retornou novas perguntas para adicionar à sala.',
            };
        }

        deps.onApplyQuestions(mergeResult.questions, targetRoomId);

        const isPartial = mergeResult.addedCount < requestedCount;

        return {
            success: true,
            status: isPartial ? 'PARTIAL' : 'COMPLETED',
            requestedCount,
            receivedCount: mergeResult.uniqueReceivedCount,
            addedCount: mergeResult.addedCount,
            importedCount: mergeResult.addedCount,
            questions: mergeResult.addedQuestions,
        };
    } catch (error) {
        if (error instanceof InvalidImportResponseError) {
            return {
                success: false,
                status: 'INVALID_RESPONSE',
                requestedCount,
                receivedCount: 0,
                addedCount: 0,
                importedCount: 0,
                error: error.message,
            };
        }

        const formatted = formatImportQuestionsError(error);
        return {
            success: false,
            status: 'API_ERROR',
            requestedCount,
            receivedCount: 0,
            addedCount: 0,
            importedCount: 0,
            error: formatted.message,
            ...(formatted.httpStatus !== undefined && {
                httpStatus: formatted.httpStatus,
            }),
            ...(formatted.fieldErrors && {
                fieldErrors: formatted.fieldErrors,
            }),
        };
    } finally {
        if (deps.tracker.inFlightByRoomId[targetRoomId] === opSeq) {
            delete deps.tracker.inFlightByRoomId[targetRoomId];
        }

        if (deps.tracker.activeRoomId === targetRoomId) {
            deps.onImportingChange?.(false);
        }
    }
}

export const PREVIEW_PAGE_SIZE = 10;

export function formatImportFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function canCloseImportModal(isImporting: boolean): boolean {
    return !isImporting;
}

export interface PaginatedPreviewResult {
    items: QuestionImportPreviewItem[];
    currentPage: number;
    totalPages: number;
    totalItems: number;
    startIndex: number;
    endIndex: number;
    hasPrevious: boolean;
    hasNext: boolean;
}

export function paginatePreviewItems(
    items: readonly QuestionImportPreviewItem[],
    requestedPage: number,
    pageSize: number = PREVIEW_PAGE_SIZE,
): PaginatedPreviewResult {
    const safePageSize = Math.max(1, Math.floor(pageSize));
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const currentPage = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
    const startIndex = (currentPage - 1) * safePageSize;
    const endIndex = Math.min(startIndex + safePageSize, totalItems);

    return {
        items: items.slice(startIndex, endIndex),
        currentPage,
        totalPages,
        totalItems,
        startIndex,
        endIndex,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages,
    };
}

export interface ImportModalOutcomeSummary {
    status: ImportQuestionsExecutionResult['status'];
    tone: 'success' | 'warning' | 'error';
    title: string;
    message: string;
    fieldErrorMessages: string[];
    canRetry: boolean;
    canFinish: boolean;
}

export function describeImportOutcome(
    result: ImportQuestionsExecutionResult,
): ImportModalOutcomeSummary {
    if (result.success) {
        if (result.status === 'COMPLETED') {
            return {
                status: 'COMPLETED',
                tone: 'success',
                title: 'Importação concluída',
                message: `${result.addedCount} ${result.addedCount === 1 ? 'pergunta importada' : 'perguntas importadas'} com sucesso para a sala.`,
                fieldErrorMessages: [],
                canRetry: false,
                canFinish: true,
            };
        }

        return {
            status: 'PARTIAL',
            tone: 'warning',
            title: 'Importação parcial concluída',
            message: `${result.addedCount} de ${result.requestedCount} perguntas foram adicionadas à sala. Confira a listagem antes de iniciar a partida.`,
            fieldErrorMessages: [],
            canRetry: false,
            canFinish: true,
        };
    }

    switch (result.status) {
        case 'EMPTY_RESPONSE':
            return {
                status: 'EMPTY_RESPONSE',
                tone: 'error',
                title: 'Nenhuma pergunta adicionada',
                message: result.error,
                fieldErrorMessages: [],
                canRetry: true,
                canFinish: false,
            };

        case 'INVALID_RESPONSE':
            return {
                status: 'INVALID_RESPONSE',
                tone: 'error',
                title: 'Resposta inválida do servidor',
                message: result.error,
                fieldErrorMessages: [],
                canRetry: true,
                canFinish: false,
            };

        case 'API_ERROR': {
            const fieldErrorMessages = result.fieldErrors
                ? Object.values(result.fieldErrors).filter((msg) =>
                      Boolean(msg?.trim()),
                  )
                : [];
            return {
                status: 'API_ERROR',
                tone: 'error',
                title: 'Não foi possível concluir a importação',
                message: result.error,
                fieldErrorMessages,
                canRetry: true,
                canFinish: false,
            };
        }

        case 'ALREADY_IMPORTING':
            return {
                status: 'ALREADY_IMPORTING',
                tone: 'warning',
                title: 'Importação em andamento',
                message: result.error,
                fieldErrorMessages: [],
                canRetry: false,
                canFinish: false,
            };

        case 'NO_ACTIVE_ROOM':
            return {
                status: 'NO_ACTIVE_ROOM',
                tone: 'error',
                title: 'Nenhuma sala selecionada',
                message: result.error,
                fieldErrorMessages: [],
                canRetry: false,
                canFinish: false,
            };

        case 'STALE_ROOM':
            return {
                status: 'STALE_ROOM',
                tone: 'warning',
                title: 'Sala alterada durante a importação',
                message:
                    'A sala ativa mudou antes do término da requisição; esta operação não foi aplicada à sala atual.',
                fieldErrorMessages: [],
                canRetry: false,
                canFinish: false,
            };
    }
}

export interface ImportModalSelectedFileMeta {
    name: string;
    size: number;
    type?: string;
}

export interface ImportModalState {
    selectedFile: ImportModalSelectedFileMeta | null;
    rawJsonText: string | null;
    validation: QuestionImportValidationResult | null;
    readError: string | null;
    isReadingFile: boolean;
    page: number;
    outcome: ImportModalOutcomeSummary | null;
}

export function createInitialImportModalState(): ImportModalState {
    return {
        selectedFile: null,
        rawJsonText: null,
        validation: null,
        readError: null,
        isReadingFile: false,
        page: 1,
        outcome: null,
    };
}

export function applyValidatedJsonTextToModalState(
    selectedFile: ImportModalSelectedFileMeta,
    rawJsonText: string,
    existingQuestions: readonly Pick<Question, 'statement'>[],
): ImportModalState {
    const validation = parseAndValidateImportJson(rawJsonText, existingQuestions);

    return {
        selectedFile,
        rawJsonText,
        validation,
        readError: null,
        isReadingFile: false,
        page: 1,
        outcome: null,
    };
}

export function recomputeImportStateDuplicates(
    state: ImportModalState,
    existingQuestions: readonly Pick<Question, 'statement'>[],
): ImportModalState {
    if (!state.validation || !state.validation.valid) {
        return state;
    }

    const { previewItems, warnings } = findRoomStatementDuplicates(
        state.validation.questions,
        existingQuestions,
    );

    return {
        ...state,
        validation: {
            valid: true,
            questions: state.validation.questions,
            previewItems,
            warnings,
        },
    };
}

export function canConfirmImportState(params: {
    state: ImportModalState;
    roomId: string | null;
    roomStatus: string | null;
    isImporting: boolean;
}): boolean {
    const { state, roomId, roomStatus, isImporting } = params;

    if (!roomId || roomStatus !== 'WAITING') return false;
    if (isImporting || state.isReadingFile) return false;
    if (!state.validation || !state.validation.valid) return false;
    if (state.validation.questions.length === 0) return false;
    if (
        state.outcome &&
        (state.outcome.status === 'COMPLETED' ||
            state.outcome.status === 'PARTIAL')
    ) {
        return false;
    }

    return true;
}
