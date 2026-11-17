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

export function useQuestionFormViewModel(
    initial: Question | null,
    onSave: (question: Question) => Promise<void> | void,
) {
    const [draft, setDraft] = useState<QuestionDraft>(() =>
        initial ? questionToDraft(initial) : createEmptyDraft(),
    );
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

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
            correctChoiceId: draft.correctChoiceId === id ? null : draft.correctChoiceId,
        });
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const validationError = validateDraft(draft);
        if (validationError) {
            setError(validationError);
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await onSave(draftToQuestion(draft, initial));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar pergunta na sala.');
        } finally {
            setIsSaving(false);
        }
    }

    return {
        draft,
        error,
        isSaving,
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
