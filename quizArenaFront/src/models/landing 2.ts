/*
 * MODEL — tipos da landing page.
 *
 * Descreve a forma dos dados apresentados pela página inicial, sem
 * qualquer referência a React ou a estilos. Views e ViewModels dependem
 * destes tipos; o contrário nunca acontece.
 */

/** Nomes dos ícones disponíveis no componente <Icon />. */
export type IconName =
    | 'edit'
    | 'users'
    | 'play'
    | 'trophy'
    | 'chart'
    | 'key'
    | 'book'
    | 'bolt'
    | 'menu'
    | 'close'
    | 'check';

/**
 * Situação de um recurso da plataforma.
 * Regra do projeto: só é "available" o que já funciona de ponta a ponta
 * (frontend + backend). O restante é exibido como recurso previsto.
 */
export type FeatureStatus = 'available' | 'planned';

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
    available: 'Disponível',
    planned: 'Em breve',
};

/** Item de navegação que aponta para uma seção da landing page. */
export interface NavItem {
    sectionId: string;
    label: string;
}

/** Etapa do fluxo "Como funciona". */
export interface HowItWorksStep {
    title: string;
    description: string;
    icon: IconName;
}

/** Público atendido pela plataforma e seus benefícios. */
export interface AudienceBenefits {
    audience: 'teacher' | 'student';
    title: string;
    description: string;
    icon: IconName;
    benefits: string[];
}

/** Recurso da plataforma exibido em card. */
export interface PlatformFeature {
    id: string;
    title: string;
    description: string;
    icon: IconName;
    status: FeatureStatus;
}
