import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveSection } from '../hooks/useActiveSection';
import {
    AUDIENCES,
    HOW_IT_WORKS_STEPS,
    NAV_ITEMS,
    PLATFORM_FEATURES,
    SECTION_IDS,
} from '../models/landingContent';

// Constante de módulo: referência estável exigida por useActiveSection.
const OBSERVED_SECTION_IDS = NAV_ITEMS.map((item) => item.sectionId);

/** Rota para onde o usuário vai após o login (mesma usada em /login). */
const AFTER_LOGIN_ROUTE = '/dashboard';

/*
 * VIEWMODEL da landing page.
 *
 * Responsabilidades:
 *  - expor à View o conteúdo vindo do Model;
 *  - controlar a abertura do modal de login;
 *  - decidir a navegação após o login bem-sucedido;
 *  - informar a seção ativa para o Header.
 *
 * A autenticação em si NÃO acontece aqui: ela continua dentro do
 * LoginForm existente, que chama o authService. Este ViewModel apenas
 * reage ao callback onSuccess que o próprio LoginForm já oferece.
 */
export function useLandingViewModel() {
    const navigate = useNavigate();
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const activeSectionId = useActiveSection(OBSERVED_SECTION_IDS);

    const openLogin = useCallback(() => setIsLoginOpen(true), []);
    const closeLogin = useCallback(() => setIsLoginOpen(false), []);

    const handleLoginSuccess = useCallback(() => {
        setIsLoginOpen(false);
        navigate(AFTER_LOGIN_ROUTE);
    }, [navigate]);

    return {
        navItems: NAV_ITEMS,
        sectionIds: SECTION_IDS,
        steps: HOW_IT_WORKS_STEPS,
        audiences: AUDIENCES,
        features: PLATFORM_FEATURES,
        activeSectionId,
        isLoginOpen,
        openLogin,
        closeLogin,
        handleLoginSuccess,
    };
}
