import { useEffect, useState } from 'react';

/*
 * Hook utilitário (não é ViewModel): informa qual seção está visível na
 * faixa superior da tela, para destacar o link correspondente no Header.
 *
 * Usa IntersectionObserver em vez de ouvir o evento de scroll, evitando
 * cálculos a cada pixel rolado.
 *
 * Importante: `sectionIds` deve ser uma referência estável (constante de
 * módulo ou useMemo), senão o observador é recriado a cada renderização.
 */
export function useActiveSection(sectionIds: readonly string[]): string | null {
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        const visibility = new Map<string, boolean>();

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => visibility.set(entry.target.id, entry.isIntersecting));
                // A primeira seção (na ordem da página) dentro da faixa é a ativa.
                const current = sectionIds.find((id) => visibility.get(id)) ?? null;
                setActiveId(current);
            },
            // Faixa estreita logo abaixo do Header: uma seção só fica ativa
            // quando ocupa essa região, o que evita destaque "pulando".
            { rootMargin: '-35% 0px -60% 0px' },
        );

        sectionIds.forEach((id) => {
            const element = document.getElementById(id);
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, [sectionIds]);

    return activeId;
}
