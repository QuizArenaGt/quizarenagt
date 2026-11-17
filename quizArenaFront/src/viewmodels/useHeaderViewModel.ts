import { useCallback, useEffect, useState } from 'react';

/** Largura a partir da qual o menu completo aparece (igual ao Header.css). */
const DESKTOP_MEDIA_QUERY = '(min-width: 900px)';
/** Rolagem mínima para o Header ganhar fundo sólido e sombra. */
const SCROLL_THRESHOLD = 8;

/*
 * VIEWMODEL do Header.
 *
 * Concentra o estado de interface do cabeçalho: menu mobile aberto/fechado
 * e se a página foi rolada. A View (Header.tsx) apenas lê estes valores e
 * chama as ações; não registra eventos nem guarda estado próprio.
 */
export function useHeaderViewModel() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(() => window.scrollY > SCROLL_THRESHOLD);

    const toggleMenu = useCallback(() => setIsMenuOpen((open) => !open), []);
    const closeMenu = useCallback(() => setIsMenuOpen(false), []);

    useEffect(() => {
        function handleScroll() {
            setIsScrolled(window.scrollY > SCROLL_THRESHOLD);
        }

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Com o menu aberto: Esc fecha, e voltar ao layout desktop também fecha,
    // para o menu não reaparecer aberto ao reduzir a janela de novo.
    useEffect(() => {
        if (!isMenuOpen) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setIsMenuOpen(false);
        }

        const desktopQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
        function handleViewportChange(event: MediaQueryListEvent) {
            if (event.matches) setIsMenuOpen(false);
        }

        document.addEventListener('keydown', handleKeyDown);
        desktopQuery.addEventListener('change', handleViewportChange);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            desktopQuery.removeEventListener('change', handleViewportChange);
        };
    }, [isMenuOpen]);

    return { isMenuOpen, isScrolled, toggleMenu, closeMenu };
}
