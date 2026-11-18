import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveSection } from '../hooks/useActiveSection';
import { buildPlayRouteWithPin, executeVerifyRoomCode } from '../models/game';
import {
    AUDIENCES,
    HOW_IT_WORKS_STEPS,
    NAV_ITEMS,
    PLATFORM_FEATURES,
    SECTION_IDS,
} from '../models/landingContent';
import { verifyRoomAvailability } from '../services/gameRoomService';

// Constante de módulo: referência estável exigida por useActiveSection.
const OBSERVED_SECTION_IDS = NAV_ITEMS.map((item) => item.sectionId);

/** Rota para onde o usuário vai após o login (mesma usada em /login). */
const AFTER_LOGIN_ROUTE = '/dashboard';
/** Rota da área do aluno. */
const PLAY_ROUTE = '/jogar';

/*
 * VIEWMODEL da landing page.
 *
 * Responsabilidades:
 *  - expor à View o conteúdo vindo do Model;
 *  - controlar a abertura do modal de login;
 *  - decidir a navegação após o login bem-sucedido;
 *  - informar a seção ativa para o Header;
 *  - validar formato e existência/disponibilidade da sala antes de levar o aluno para /jogar.
 */
export function useLandingViewModel() {
    const navigate = useNavigate();
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [isCheckingRoom, setIsCheckingRoom] = useState(false);
    const isCheckingRoomRef = useRef(false);
    const activeSectionId = useActiveSection(OBSERVED_SECTION_IDS);

    const openLogin = useCallback(() => setIsLoginOpen(true), []);
    const closeLogin = useCallback(() => setIsLoginOpen(false), []);

    const handleLoginSuccess = useCallback(() => {
        setIsLoginOpen(false);
        navigate(AFTER_LOGIN_ROUTE);
    }, [navigate]);

    const clearJoinError = useCallback(() => {
        setJoinError(null);
    }, []);

    /**
     * Valida o formato e consulta o backend sobre a existência/disponibilidade da sala
     * antes de navegar para /jogar.
     */
    const handleJoinRoom = useCallback(
        async (pin: string) => {
            await executeVerifyRoomCode({
                rawCode: pin,
                lockRef: isCheckingRoomRef,
                checkAvailability: verifyRoomAvailability,
                setIsLoading: setIsCheckingRoom,
                setError: setJoinError,
                onSuccess: (cleanPin) => {
                    navigate(buildPlayRouteWithPin(cleanPin, PLAY_ROUTE));
                },
            });
        },
        [navigate],
    );

    return {
        navItems: NAV_ITEMS,
        sectionIds: SECTION_IDS,
        steps: HOW_IT_WORKS_STEPS,
        audiences: AUDIENCES,
        features: PLATFORM_FEATURES,
        activeSectionId,
        isLoginOpen,
        joinError,
        isCheckingRoom,
        openLogin,
        closeLogin,
        clearJoinError,
        handleLoginSuccess,
        handleJoinRoom,
    };
}
