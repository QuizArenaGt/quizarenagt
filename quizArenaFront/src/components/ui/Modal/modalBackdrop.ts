export interface BackdropPointerState {
    startedOnBackdrop: boolean;
    endedOnBackdrop: boolean;
}

export interface BackdropPointerEventLike {
    target: unknown;
    currentTarget: unknown;
    button?: number;
    pointerType?: string;
    isPrimary?: boolean;
}

/**
 * Cria o estado inicial de rastreamento de ponteiro para fechamento por backdrop.
 */
export function createBackdropPointerState(): BackdropPointerState {
    return {
        startedOnBackdrop: false,
        endedOnBackdrop: false,
    };
}

/**
 * Limpa os marcadores de início e término de clique no backdrop.
 */
export function resetBackdropPointerState(state: BackdropPointerState): void {
    state.startedOnBackdrop = false;
    state.endedOnBackdrop = false;
}

/**
 * Registra onde o pressionamento inicial do ponteiro começou.
 * Cliques secundários (botão direito) ou ponteiros não primários são ignorados.
 */
export function recordBackdropPointerDown(
    state: BackdropPointerState,
    event: BackdropPointerEventLike,
): void {
    const isSecondaryMouseButton =
        event.pointerType === 'mouse' &&
        typeof event.button === 'number' &&
        event.button !== 0;

    if (event.isPrimary === false || isSecondaryMouseButton) {
        resetBackdropPointerState(state);
        return;
    }

    state.startedOnBackdrop = event.target === event.currentTarget;
    state.endedOnBackdrop = false;
}

/**
 * Registra se o ponteiro foi solto exatamente sobre o backdrop.
 * Evita que um arraste iniciado no backdrop e solto dentro do painel feche o modal.
 */
export function recordBackdropPointerUp(
    state: BackdropPointerState,
    event: BackdropPointerEventLike,
): void {
    if (event.isPrimary === false) {
        return;
    }

    state.endedOnBackdrop = event.target === event.currentTarget;
}

/**
 * Consome e reseta o estado após o evento click, retornando true apenas quando
 * pressionamento, liberação e click ocorreram diretamente no backdrop.
 */
export function consumeBackdropClick(
    state: BackdropPointerState,
    event: Pick<BackdropPointerEventLike, 'target' | 'currentTarget'>,
): boolean {
    const shouldClose =
        state.startedOnBackdrop &&
        state.endedOnBackdrop &&
        event.target === event.currentTarget;

    resetBackdropPointerState(state);
    return shouldClose;
}
