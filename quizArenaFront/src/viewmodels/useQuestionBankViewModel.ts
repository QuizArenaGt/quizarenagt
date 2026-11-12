import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Question } from '../models/question';
import { loadQuestions, saveQuestions } from '../services/questionStorageService';

/*
 * VIEWMODEL do banco de perguntas (aba "Admin de Perguntas" do painel).
 *
 * Guarda a lista de perguntas, controla a abertura do formulário
 * (criar/editar) e persiste as alterações pelo questionStorageService.
 */
export function useQuestionBankViewModel() {
    const [questions, setQuestions] = useState<Question[]>(() => loadQuestions());
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

    // Toda alteração na lista é salva, para que a sala de demonstração
    // do aluno use as perguntas mais recentes.
    useEffect(() => {
        saveQuestions(questions);
    }, [questions]);

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

    /** Insere uma pergunta nova ou substitui a existente com o mesmo id. */
    const saveQuestion = useCallback((saved: Question) => {
        setQuestions((current) =>
            current.some((question) => question.id === saved.id)
                ? current.map((question) => (question.id === saved.id ? saved : question))
                : [...current, saved],
        );
        setIsFormOpen(false);
    }, []);

    const toggleStatus = useCallback((id: string) => {
        setQuestions((current) =>
            current.map((question) =>
                question.id === id ? { ...question, isActive: !question.isActive } : question,
            ),
        );
    }, []);

    return {
        questions,
        activeCount,
        isFormOpen,
        editingQuestion,
        openCreate,
        openEdit,
        closeForm,
        saveQuestion,
        toggleStatus,
    };
}
