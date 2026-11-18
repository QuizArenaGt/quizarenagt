import { useEffect, useRef } from 'react';

/*
 * Hook utilitário de acessibilidade: move o foco para o elemento quando
 * ele aparece. Usado nas etapas da partida (que trocam o conteúdo da tela
 * sem mudar de rota), para que leitores de tela anunciem o novo título e
 * a navegação por teclado recomece do lugar certo.
 * O elemento alvo deve ter tabIndex={-1}.
 */
export function useFocusOnMount<T extends HTMLElement>() {
    const ref = useRef<T>(null);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    return ref;
}
