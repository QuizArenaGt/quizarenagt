import { apiRequest } from './api.ts';
import {
    DEFAULT_THEME,
    MIN_CHOICES,
    type Question,
    type QuestionType,
} from '../models/question.ts';
import {
    InvalidImportResponseError,
    mergeImportedQuestionsWithStats,
    type ImportQuestionInput,
    type ImportQuestionsBatchResponse,
} from '../models/questionImport.ts';

export interface ImportQuestionsApiResponse {
    message: string;
    importedCount: number;
    questions: ApiQuestion[];
}

export interface ApiQuestionOption {
    id: string;
    text: string;
    isCorrect: boolean;
    position: number;
    questionId: string;
}

export interface ApiQuestion {
    id: string;
    statement: string;
    type: QuestionType;
    isActive: boolean;
    roomId: string;
    createdAt: string;
    updatedAt: string;
    options: ApiQuestionOption[];
}

export function mapApiQuestionToModel(
    apiQuestion: ApiQuestion,
    theme: string = DEFAULT_THEME,
): Question {
    return {
        id: apiQuestion.id,
        roomId: apiQuestion.roomId,
        statement: apiQuestion.statement,
        type: apiQuestion.type,
        isActive: apiQuestion.isActive,
        theme: theme.trim() || DEFAULT_THEME,
        options: apiQuestion.options.map((opt) => ({
            id: opt.id,
            text: opt.text,
            isCorrect: opt.isCorrect,
        })),
    };
}

export async function listQuestionsByRoomApi(roomId: string): Promise<Question[]> {
    const response = await apiRequest<ApiQuestion[]>(
        `/questions?roomId=${encodeURIComponent(roomId)}`,
        {
            method: 'GET',
        },
    );
    return response.map((q) => mapApiQuestionToModel(q));
}

export async function createQuestionApi(input: {
    roomId: string;
    statement: string;
    type: QuestionType;
    theme?: string;
    options: { text: string; isCorrect: boolean }[];
}): Promise<Question> {
    const response = await apiRequest<ApiQuestion>('/questions', {
        method: 'POST',
        body: JSON.stringify({
            roomId: input.roomId,
            statement: input.statement.trim(),
            type: input.type,
            options: input.options.map((opt) => ({
                text: opt.text.trim(),
                isCorrect: opt.isCorrect,
            })),
        }),
    });
    return mapApiQuestionToModel(response, input.theme);
}

export async function updateQuestionApi(
    questionId: string,
    input: {
        statement: string;
        type: QuestionType;
        theme?: string;
        options: { text: string; isCorrect: boolean }[];
    },
): Promise<Question> {
    const response = await apiRequest<ApiQuestion>(`/questions/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify({
            statement: input.statement.trim(),
            type: input.type,
            options: input.options.map((opt) => ({
                text: opt.text.trim(),
                isCorrect: opt.isCorrect,
            })),
        }),
    });
    return mapApiQuestionToModel(response, input.theme);
}

export async function deleteQuestionApi(questionId: string): Promise<void> {
    await apiRequest<{ message: string }>(`/questions/${questionId}`, {
        method: 'DELETE',
    });
}

function isValidApiQuestionOption(value: unknown): value is ApiQuestionOption {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const opt = value as Record<string, unknown>;
    return (
        typeof opt.id === 'string' &&
        opt.id.trim().length > 0 &&
        typeof opt.text === 'string' &&
        opt.text.trim().length > 0 &&
        typeof opt.isCorrect === 'boolean'
    );
}

export function isValidApiQuestion(value: unknown): value is ApiQuestion {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const q = value as Record<string, unknown>;
    return (
        typeof q.id === 'string' &&
        q.id.trim().length > 0 &&
        typeof q.statement === 'string' &&
        q.statement.trim().length > 0 &&
        (q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') &&
        Array.isArray(q.options) &&
        q.options.length >= MIN_CHOICES &&
        q.options.every(isValidApiQuestionOption)
    );
}

export async function importQuestionsApi(
    roomId: string,
    questions: readonly ImportQuestionInput[],
): Promise<ImportQuestionsBatchResponse> {
    const response = await apiRequest<ImportQuestionsApiResponse>(
        `/rooms/${encodeURIComponent(roomId)}/questions/import`,
        {
            method: 'POST',
            body: JSON.stringify({
                questions: questions.map((question) => ({
                    statement: question.statement.trim(),
                    type: question.type,
                    options: question.options.map((option) => ({
                        text: option.text.trim(),
                        isCorrect: option.isCorrect,
                    })),
                })),
            }),
        },
    );

    if (
        !response ||
        typeof response !== 'object' ||
        Array.isArray(response) ||
        !Array.isArray(response.questions) ||
        !response.questions.every(isValidApiQuestion)
    ) {
        throw new InvalidImportResponseError();
    }

    const mappedQuestions = response.questions.map((question) =>
        mapApiQuestionToModel(question),
    );
    const uniqueQuestions = mergeImportedQuestionsWithStats(
        [],
        mappedQuestions,
    ).addedQuestions;

    return {
        message:
            typeof response.message === 'string'
                ? response.message
                : '',
        importedCount: uniqueQuestions.length,
        questions: uniqueQuestions,
    };
}
