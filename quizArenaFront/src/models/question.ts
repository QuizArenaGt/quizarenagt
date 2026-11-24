/*
 * MODEL — perguntas.
 *
 * Os tipos espelham o modelo do backend (prisma/schema.prisma:
 * Question e QuestionOption), para que a troca do armazenamento
 * temporário pela API real não exija mudanças nas telas.
 *
 * Exceção: `theme` existe apenas no frontend (o Dashboard já exibia o
 * tema da pergunta); o backend ainda não possui esse campo.
 */

export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

export interface QuestionOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

export interface Question {
    id: string;
    statement: string;
    type: QuestionType;
    isActive: boolean;
    theme: string;
    options: QuestionOption[];
    roomId?: string;
}

// ===== Regras de domínio =====

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 4;
export const STATEMENT_MAX_LENGTH = 300;
export const OPTION_MAX_LENGTH = 120;
export const DEFAULT_THEME = 'Geral';
export const TRUE_LABEL = 'Verdadeiro';
export const FALSE_LABEL = 'Falso';
export const TRUE_FALSE_STANDARD_OPTIONS = [TRUE_LABEL, FALSE_LABEL] as const;

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
    MULTIPLE_CHOICE: 'Múltipla escolha',
    TRUE_FALSE: 'Verdadeiro ou falso',
};

/** Letras exibidas antes de cada alternativa. */
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

export type QuestionOptionTone = '0' | '1' | '2' | '3' | 'true' | 'false';

function isTrueFalseOptionSet(options?: readonly { text: string }[]): boolean {
    if (!options || options.length !== 2) {
        return false;
    }

    const normalized = new Set(options.map((option) => option.text.trim().toLowerCase()));
    return (
        normalized.has(TRUE_LABEL.toLowerCase()) &&
        normalized.has(FALSE_LABEL.toLowerCase())
    );
}

/**
 * Resolve a variante visual de uma alternativa de forma compartilhada entre jogador e projeção:
 * - Em Verdadeiro ou Falso, segue exclusivamente o significado ("Verdadeiro" -> true, "Falso" -> false),
 *   independente da posição no array.
 * - Em múltipla escolha convencional, preserva a paleta por índice (0..3).
 */
export function getQuestionOptionTone(
    questionType: QuestionType | undefined,
    optionText: string,
    index: number,
    allOptions?: readonly { text: string }[],
): QuestionOptionTone {
    const isTrueFalse =
        questionType === 'TRUE_FALSE' ||
        (questionType === undefined && isTrueFalseOptionSet(allOptions));

    if (isTrueFalse) {
        const normalized = optionText.trim().toLowerCase();
        if (normalized === TRUE_LABEL.toLowerCase()) {
            return 'true';
        }
        if (normalized === FALSE_LABEL.toLowerCase()) {
            return 'false';
        }
    }

    return String(index % 4) as '0' | '1' | '2' | '3';
}

/** Gera ids locais enquanto não há backend (randomUUID quando disponível). */
export function createId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ===== Rascunho usado pelo formulário =====

/*
 * O formulário trabalha com um "rascunho" mais adequado à edição do que o
 * formato final:
 *  - múltipla escolha guarda as alternativas e o id da correta (regra do
 *    projeto: exatamente UMA alternativa correta);
 *  - verdadeiro ou falso guarda apenas qual das duas é a correta.
 * Manter os dois permite alternar o tipo sem perder o que foi digitado.
 */
export interface DraftChoice {
    id: string;
    text: string;
}

export interface QuestionDraft {
    statement: string;
    theme: string;
    type: QuestionType;
    choices: DraftChoice[];
    correctChoiceId: string | null;
    trueFalseAnswer: boolean | null;
}

export function createEmptyDraft(): QuestionDraft {
    return {
        statement: '',
        theme: '',
        type: 'MULTIPLE_CHOICE',
        choices: [
            { id: createId(), text: '' },
            { id: createId(), text: '' },
            { id: createId(), text: '' },
            { id: createId(), text: '' },
        ],
        correctChoiceId: null,
        trueFalseAnswer: null,
    };
}

export function questionToDraft(question: Question): QuestionDraft {
    const empty = createEmptyDraft();

    if (question.type === 'TRUE_FALSE') {
        const trueOption = question.options.find((option) => option.text === TRUE_LABEL);
        return {
            ...empty,
            statement: question.statement,
            theme: question.theme,
            type: 'TRUE_FALSE',
            trueFalseAnswer: trueOption ? trueOption.isCorrect : null,
        };
    }

    return {
        ...empty,
        statement: question.statement,
        theme: question.theme,
        type: 'MULTIPLE_CHOICE',
        choices: question.options.map((option) => ({ id: option.id, text: option.text })),
        correctChoiceId: question.options.find((option) => option.isCorrect)?.id ?? null,
    };
}

/** Converte o rascunho (já validado) para o formato final da pergunta. */
export function draftToQuestion(draft: QuestionDraft, existing: Question | null): Question {
    const options: QuestionOption[] =
        draft.type === 'TRUE_FALSE'
            ? [
                  { id: createId(), text: TRUE_LABEL, isCorrect: draft.trueFalseAnswer === true },
                  { id: createId(), text: FALSE_LABEL, isCorrect: draft.trueFalseAnswer === false },
              ]
            : draft.choices.map((choice) => ({
                  id: choice.id,
                  text: choice.text.trim(),
                  isCorrect: choice.id === draft.correctChoiceId,
              }));

    return {
        id: existing?.id ?? createId(),
        isActive: existing?.isActive ?? true,
        statement: draft.statement.trim(),
        theme: draft.theme.trim() || DEFAULT_THEME,
        type: draft.type,
        options,
    };
}

/**
 * Valida o rascunho e devolve a primeira mensagem de erro encontrada,
 * ou null quando a pergunta pode ser salva.
 */
export function validateDraft(draft: QuestionDraft): string | null {
    if (!draft.statement.trim()) {
        return 'Escreva o enunciado da pergunta.';
    }

    if (draft.type === 'TRUE_FALSE') {
        return draft.trueFalseAnswer === null
            ? 'Indique se a afirmação é verdadeira ou falsa.'
            : null;
    }

    if (draft.choices.length < MIN_CHOICES || draft.choices.length > MAX_CHOICES) {
        return `A pergunta deve ter de ${MIN_CHOICES} a ${MAX_CHOICES} alternativas.`;
    }

    if (draft.choices.some((choice) => !choice.text.trim())) {
        return 'Preencha todas as alternativas ou remova as que não serão usadas.';
    }

    const normalized = draft.choices.map((choice) => choice.text.trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
        return 'As alternativas não podem se repetir.';
    }

    if (!draft.choices.some((choice) => choice.id === draft.correctChoiceId)) {
        return 'Marque qual alternativa é a correta.';
    }

    return null;
}

/** Uma pergunta só pode ir para uma partida se tiver exatamente uma resposta correta. */
export function isPlayable(question: Question): boolean {
    return (
        question.options.length >= MIN_CHOICES &&
        question.options.filter((option) => option.isCorrect).length === 1
    );
}

export type QuestionTypeFilter = 'ALL' | QuestionType;

/** Filtra perguntas da sala por texto (enunciado, tema ou alternativas) e tipo. */
export function filterQuestions<
    TQuestion extends Pick<Question, 'statement' | 'theme' | 'type' | 'options'>,
>(
    questions: readonly TQuestion[],
    query: string,
    typeFilter: QuestionTypeFilter = 'ALL',
): { question: TQuestion; number: number }[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return questions.reduce<{ question: TQuestion; number: number }[]>(
        (acc, question, index) => {
            if (typeFilter !== 'ALL' && question.type !== typeFilter) {
                return acc;
            }

            if (normalizedQuery) {
                const matchesStatement = question.statement
                    .toLocaleLowerCase()
                    .includes(normalizedQuery);
                const matchesTheme = question.theme
                    .toLocaleLowerCase()
                    .includes(normalizedQuery);
                const matchesOptions = question.options.some((opt) =>
                    opt.text.toLocaleLowerCase().includes(normalizedQuery),
                );
                if (!matchesStatement && !matchesTheme && !matchesOptions) {
                    return acc;
                }
            }

            acc.push({ question, number: index + 1 });
            return acc;
        },
        [],
    );
}
