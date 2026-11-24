export interface QuestionVisibilityInput {
    hasSubmittedAnswer: boolean;
    isSubmittingAnswer: boolean;
    answerError: string | null;
    /**
     * Preferência manual na rodada atual (`null` = padrão automático:
     * visível antes da confirmação e oculta automaticamente após confirmação).
     */
    manualVisibilityOverride: boolean | null;
}

export interface QuestionVisibilityState {
    canHideQuestion: boolean;
    isQuestionHidden: boolean;
}

/**
 * Resolve se o jogador pode alternar a visibilidade e se a confirmação compacta está ativa.
 * Antes da confirmação, durante o envio ou em erro, a pergunta permanece visível.
 * Assim que o servidor confirma o envio bem-sucedido, oculta automaticamente (`true`),
 * podendo ser exibida/ocultada manualmente pelo jogador via `manualVisibilityOverride`.
 */
export function resolveQuestionVisibilityState({
    hasSubmittedAnswer,
    isSubmittingAnswer,
    answerError,
    manualVisibilityOverride,
}: QuestionVisibilityInput): QuestionVisibilityState {
    const canHideQuestion =
        hasSubmittedAnswer && !isSubmittingAnswer && !answerError;

    if (!canHideQuestion) {
        return {
            canHideQuestion: false,
            isQuestionHidden: false,
        };
    }

    return {
        canHideQuestion: true,
        isQuestionHidden: manualVisibilityOverride ?? true,
    };
}

/**
 * Alterna a preferência visual local do jogador somente quando o envio foi confirmado.
 */
export function toggleQuestionVisibilityPreference(
    currentOverride: boolean | null,
    input: Omit<QuestionVisibilityInput, 'manualVisibilityOverride'>,
): boolean | null {
    const state = resolveQuestionVisibilityState({
        ...input,
        manualVisibilityOverride: currentOverride,
    });

    if (!state.canHideQuestion) {
        return null;
    }

    return !state.isQuestionHidden;
}
