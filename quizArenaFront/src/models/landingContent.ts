/*
 * MODEL — conteúdo estático da landing page.
 *
 * Mantido fora das Views para que os textos possam ser revisados sem
 * tocar em componentes. O status de cada recurso reflete o que o backend
 * oferece hoje: apenas cadastro e login estão implementados; quizzes,
 * salas, partidas e ranking ainda são previstos.
 */
import type {
    AudienceBenefits,
    HowItWorksStep,
    NavItem,
    PlatformFeature,
} from './landing';

/** Identificadores das seções, usados nas âncoras e no destaque do Header. */
export const SECTION_IDS = {
    howItWorks: 'como-funciona',
    audiences: 'para-quem',
    features: 'recursos',
    joinRoom: 'entrar-em-sala',
} as const;

export const NAV_ITEMS: NavItem[] = [
    { sectionId: SECTION_IDS.howItWorks, label: 'Como funciona' },
    { sectionId: SECTION_IDS.audiences, label: 'Para quem' },
    { sectionId: SECTION_IDS.features, label: 'Recursos' },
    { sectionId: SECTION_IDS.joinRoom, label: 'Entrar em sala' },
];

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
    {
        title: 'Crie seu quiz',
        description: 'O professor monta perguntas com alternativas e guarda o quiz para usar quando quiser.',
        icon: 'edit',
    },
    {
        title: 'Abra uma sala',
        description: 'Ao iniciar a sessão, a turma recebe um código para entrar na partida.',
        icon: 'key',
    },
    {
        title: 'Todos jogam juntos',
        description: 'Os alunos respondem as mesmas perguntas, ao mesmo tempo, de qualquer dispositivo.',
        icon: 'play',
    },
    {
        title: 'Veja os resultados',
        description: 'Pontuação e ranking ajudam a entender o que a turma aprendeu.',
        icon: 'chart',
    },
];

export const AUDIENCES: AudienceBenefits[] = [
    {
        audience: 'teacher',
        title: 'Para professores',
        description: 'Revisões e avaliações mais dinâmicas, sem complicação.',
        icon: 'book',
        benefits: [
            'Prepare quizzes com antecedência e reutilize em outras turmas',
            'Conduza a partida no seu ritmo, pergunta por pergunta',
            'Identifique rapidamente os conteúdos que precisam de reforço',
        ],
    },
    {
        audience: 'student',
        title: 'Para alunos',
        description: 'Aprender vira um desafio divertido com os colegas.',
        icon: 'users',
        benefits: [
            'Entre na sala só com o código, sem etapas complicadas',
            'Responda junto com a turma e acompanhe sua pontuação',
            'Competição saudável que estimula a participação',
        ],
    },
];

export const PLATFORM_FEATURES: PlatformFeature[] = [
    {
        id: 'accounts',
        title: 'Contas de usuário',
        description: 'Cadastro e login com autenticação segura para acessar a plataforma.',
        icon: 'check',
        status: 'available',
    },
    {
        id: 'quiz-builder',
        title: 'Criação de quizzes',
        description: 'Perguntas com alternativas, organizadas em quizzes reutilizáveis.',
        icon: 'edit',
        status: 'planned',
    },
    {
        id: 'live-matches',
        title: 'Partidas simultâneas',
        description: 'Toda a turma conectada à mesma sessão, respondendo em tempo real.',
        icon: 'bolt',
        status: 'planned',
    },
    {
        id: 'results',
        title: 'Resultados e ranking',
        description: 'Pontuações e classificação para acompanhar a aprendizagem.',
        icon: 'trophy',
        status: 'planned',
    },
];

/** Texto institucional usado no Footer. */
export const PROJECT_INFO = {
    name: 'QuizArenaGT',
    description:
        'Plataforma de quizzes interativos que transforma revisões e avaliações em partidas colaborativas e divertidas.',
    academicNote: 'Projeto acadêmico desenvolvido em equipe.',
} as const;
