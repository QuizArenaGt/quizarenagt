import { apiRequest } from './api';
import { DEFAULT_THEME, type Question, type QuestionType } from '../models/question';

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
