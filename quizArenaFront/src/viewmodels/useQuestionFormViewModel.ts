import { useState, type FormEvent } from 'react';
import {
    MAX_CHOICES,
    MIN_CHOICES,
    createEmptyDraft,
    createId,
    draftToQuestion,
    questionToDraft,
    validateDraft,
    type Question,
    type QuestionDraft,
    type QuestionType,
} from '../models/question';

/*
 * VIEWMODEL do formulário de pergunta (criar/editar).
 *
 * Mantém o rascunho em edição e expõe ações simples para a View
 * (alterar enunciado, tipo, alternativas, resposta correta). As regras
 * de validação ficam no Model (validateDraft); aqui só as aplicamos no
 * envio e exibimos a mensagem.
 *
 * O componente que usa este hook é montado a cada abertura do modal,
 * então o estado inicial sempre reflete a pergunta escolhida.
 */
export function useQuestionFormViewModel(initial: Question | null, onSave: (question: Question) => void) {
    const [draft, setDraft] = useState<QuestionDraft>(() =>
        initial ? questionToDraft(initial) : createEmptyDraft(),
    );
    const [error, setError] = useState<string | null>(null);

    function update(changes: Partial<QuestionDraft>) {
        setDraft((current) => ({ ...current, ...changes }));
        setError(null);
    }

    function setChoiceText(id: string, text: string) {
        update({
            choices: draft.choices.map((choice) => (choice.id === id ? { ...choice, text } : choice)),
        });
    }

    function addChoice() {
        if (draft.choices.length >= MAX_CHOICES) return;
        update({ choices: [...draft.choices, { id: createId(), text: '' }] });
    }

    function removeChoice(id: string) {
        if (draft.choices.length <= MIN_CHOICES) return;
        update({
            choices: draft.choices.filter((choice) => choice.id !== id),
            // Se a alternativa removida era a correta, a marcação é desfeita.
            correctChoiceId: draft.correctChoiceId === id ? null : draft.correctChoiceId,
        });
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const validationError = validateDraft(draft);
        if (validationError) {
            setError(validationError);
            return;
        }
        onSave(draftToQuestion(draft, initial));
    }

    return {
        draft,
        error,
        isEditing: initial !== null,
        canAddChoice: draft.choices.length < MAX_CHOICES,
        canRemoveChoice: draft.choices.length > MIN_CHOICES,
        setStatement: (statement: string) => update({ statement }),
        setTheme: (theme: string) => update({ theme }),
        setType: (type: QuestionType) => update({ type }),
        setCorrectChoice: (correctChoiceId: string) => update({ correctChoiceId }),
        setTrueFalseAnswer: (trueFalseAnswer: boolean) => update({ trueFalseAnswer }),
        setChoiceText,
        addChoice,
        removeChoice,
        submit,
    };
}
