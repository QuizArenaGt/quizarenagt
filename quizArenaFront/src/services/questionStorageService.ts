/*
 * SERVICE TEMPORÁRIO — banco de perguntas no navegador.
 *
 * O backend já possui o modelo de perguntas (QuestionRepository), mas
 * ainda não expõe endpoints HTTP. Até lá, as perguntas ficam no
 * localStorage deste navegador, no mesmo formato do backend.
 *
 * Quando a API existir, basta substituir estas funções por chamadas
 * HTTP (ex.: GET/POST /questions) mantendo as mesmas assinaturas; os
 * ViewModels e as Views não precisarão mudar.
 */
import type { Question } from '../models/question';
import { QUESTION_SEEDS } from './mock/questionSeeds';

const STORAGE_KEY = 'quizarena:questions';

function isQuestionList(value: unknown): value is Question[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                typeof item.statement === 'string' &&
                Array.isArray(item.options),
        )
    );
}

/** Lê as perguntas salvas; na primeira vez (ou se o dado estiver inválido) usa os exemplos. */
export function loadQuestions(): Question[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed: unknown = JSON.parse(stored);
            if (isQuestionList(parsed)) return parsed;
        }
    } catch {
        // Dado corrompido ou localStorage indisponível: volta aos exemplos.
    }
    return QUESTION_SEEDS.map((question) => ({ ...question, options: [...question.options] }));
}

export function saveQuestions(questions: Question[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
    } catch {
        // Sem espaço ou sem permissão: as alterações valem só até recarregar.
    }
}
