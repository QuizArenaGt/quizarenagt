import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Question } from '../models/question';
import {
    createQuestionApi,
    deleteQuestionApi,
    listQuestionsByRoomApi,
    updateQuestionApi,
} from '../services/questionStorageService';

export function useQuestionBankViewModel(roomId: string | null) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

    const refreshQuestions = useCallback(async (targetRoomId?: string | null) => {
        const effectiveRoomId = targetRoomId !== undefined ? targetRoomId : roomId;
        if (!effectiveRoomId) {
            setQuestions([]);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const loaded = await listQuestionsByRoomApi(effectiveRoomId);
            setQuestions(loaded);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Não foi possível carregar as perguntas da sala.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [roomId]);

    useEffect(() => {
        let active = true;

        async function fetchRoomQuestions() {
            if (!roomId) {
                await Promise.resolve();
                if (active) {
                    setQuestions([]);
                    setError(null);
                }
                return;
            }

            try {
                const loaded = await listQuestionsByRoomApi(roomId);
                if (active) {
                    setQuestions(loaded);
                    setError(null);
                }
            } catch (err) {
                if (active) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Não foi possível carregar as perguntas da sala.',
                    );
                }
            }
        }

        void fetchRoomQuestions();

        return () => {
            active = false;
        };
    }, [roomId]);

    const activeCount = useMemo(
        () => questions.filter((question) => question.isActive).length,
        [questions],
    );

    const openCreate = useCallback(() => {
        setEditingQuestion(null);
        setIsFormOpen(true);
    }, []);

    const openEdit = useCallback((question: Question) => {
        setEditingQuestion(question);
        setIsFormOpen(true);
    }, []);

    const closeForm = useCallback(() => setIsFormOpen(false), []);

    const saveQuestion = useCallback(
        async (draftQuestion: Question) => {
            if (!roomId) {
                throw new Error('Selecione ou crie uma sala antes de cadastrar perguntas.');
            }

            if (editingQuestion) {
                const updated = await updateQuestionApi(editingQuestion.id, {
                    statement: draftQuestion.statement,
                    type: draftQuestion.type,
                    theme: draftQuestion.theme,
                    options: draftQuestion.options,
                });
                setQuestions((current) =>
                    current.map((q) => (q.id === updated.id ? updated : q)),
                );
            } else {
                const created = await createQuestionApi({
                    roomId,
                    statement: draftQuestion.statement,
                    type: draftQuestion.type,
                    theme: draftQuestion.theme,
                    options: draftQuestion.options,
                });
                setQuestions((current) => [...current, created]);
            }

            setIsFormOpen(false);
        },
        [roomId, editingQuestion],
    );

    const deleteQuestion = useCallback(async (id: string) => {
        setError(null);
        try {
            await deleteQuestionApi(id);
            setQuestions((current) => current.filter((question) => question.id !== id));
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Não foi possível excluir a pergunta.',
            );
        }
    }, []);

    return {
        questions,
        activeCount,
        isLoading,
        error,
        isFormOpen,
        editingQuestion,
        openCreate,
        openEdit,
        closeForm,
        saveQuestion,
        deleteQuestion,
        refreshQuestions,
    };
}
