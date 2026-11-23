export const PLAYER_AVATAR_IDS = [
    'explorer',
    'fox',
    'robot',
    'cat',
    'frog',
    'alien',
    'dino',
    'dj',
    'astronaut',
    'panda',
    'inventor',
    'pirate',
    'bee',
    'wizard',
    'red-panda',
    'monster',
    'rockstar',
] as const;

export type PlayerAvatarId = (typeof PLAYER_AVATAR_IDS)[number];

export const DEFAULT_PLAYER_AVATAR_ID: PlayerAvatarId = 'explorer';

export interface PlayerAvatarMeta {
    id: PlayerAvatarId;
    name: string;
    description: string;
    bgFrom: string;
    bgTo: string;
    ringColor: string;
}

export const PLAYER_AVATARS: readonly PlayerAvatarMeta[] = [
    {
        id: 'explorer',
        name: 'Explorador',
        description: 'Aventureiro com chapéu de expedição e jaqueta cáqui',
        bgFrom: '#DBEAFE',
        bgTo: '#93C5FD',
        ringColor: '#2563EB',
    },
    {
        id: 'fox',
        name: 'Raposa',
        description: 'Raposa esperta de pelagem laranja e creme',
        bgFrom: '#FFEDD5',
        bgTo: '#FDBA74',
        ringColor: '#EA580C',
    },
    {
        id: 'robot',
        name: 'Robô',
        description: 'Androide amigável com visor luminoso e antena',
        bgFrom: '#E0E7FF',
        bgTo: '#A5B4FC',
        ringColor: '#4F46E5',
    },
    {
        id: 'cat',
        name: 'Gato',
        description: 'Gatinho carismático de bigodes finos e coleira colorida',
        bgFrom: '#F3E8FF',
        bgTo: '#D8B4FE',
        ringColor: '#7C3AED',
    },
    {
        id: 'frog',
        name: 'Sapo',
        description: 'Sapinho alegre de olhos expressivos e bochechas rosadas',
        bgFrom: '#DCFCE7',
        bgTo: '#86EFAC',
        ringColor: '#16A34A',
    },
    {
        id: 'alien',
        name: 'Alien',
        description: 'Visitante espacial verde-menta com duas antenas',
        bgFrom: '#CCFBF1',
        bgTo: '#5EEAD4',
        ringColor: '#0D9488',
    },
    {
        id: 'dino',
        name: 'Dinossauro',
        description: 'Dinossauro simpático de crista coral',
        bgFrom: '#FEF3C7',
        bgTo: '#FCD34D',
        ringColor: '#D97706',
    },
    {
        id: 'dj',
        name: 'DJ',
        description: 'Mestre das batidas com fones roxos e óculos estilizados',
        bgFrom: '#FCE7F3',
        bgTo: '#F472B6',
        ringColor: '#DB2777',
    },
    {
        id: 'astronaut',
        name: 'Astronauta',
        description: 'Cosmonauta de capacete espacial e estrela no traje',
        bgFrom: '#E0F2FE',
        bgTo: '#7DD3FC',
        ringColor: '#0284C7',
    },
    {
        id: 'panda',
        name: 'Panda',
        description: 'Urso panda sereno de cachecol verde',
        bgFrom: '#ECFCCB',
        bgTo: '#BEF264',
        ringColor: '#65A30D',
    },
    {
        id: 'inventor',
        name: 'Inventora',
        description: 'Criadora brilhante com óculos de oficina na testa',
        bgFrom: '#FFE4E6',
        bgTo: '#FDA4AF',
        ringColor: '#E11D48',
    },
    {
        id: 'pirate',
        name: 'Pirata',
        description: 'Navegante de bandana vermelha e tapa-olho estilizado',
        bgFrom: '#CFFAFE',
        bgTo: '#67E8F9',
        ringColor: '#0891B2',
    },
    {
        id: 'bee',
        name: 'Abelha',
        description: 'Abelha enérgica de antenas arredondadas e listras douradas',
        bgFrom: '#FEF9C3',
        bgTo: '#FDE047',
        ringColor: '#CA8A04',
    },
    {
        id: 'wizard',
        name: 'Mago',
        description: 'Feiticeiro com chapéu estrelado e capa índigo',
        bgFrom: '#EDE9FE',
        bgTo: '#C4B5FD',
        ringColor: '#6D28D9',
    },
    {
        id: 'red-panda',
        name: 'Panda-vermelho',
        description: 'Panda-vermelho ruivo com marcações faciais claras',
        bgFrom: '#FED7AA',
        bgTo: '#FB923C',
        ringColor: '#C2410C',
    },
    {
        id: 'monster',
        name: 'Monstrinho',
        description: 'Criatura fofa lilás com chifres pequenos e sorriso travesso',
        bgFrom: '#FAE8FF',
        bgTo: '#E879F9',
        ringColor: '#A21CAF',
    },
    {
        id: 'rockstar',
        name: 'Roqueiro',
        description: 'Personagem de cabelo escuro comprido preso para trás, barba definida e camiseta preta',
        bgFrom: '#E2E8F0',
        bgTo: '#94A3B8',
        ringColor: '#334155',
    },
];

const AVATAR_MAP: ReadonlyMap<string, PlayerAvatarMeta> = new Map(
    PLAYER_AVATARS.map((item) => [item.id, item]),
);

export function isValidPlayerAvatarId(value: unknown): value is PlayerAvatarId {
    return typeof value === 'string' && AVATAR_MAP.has(value.trim());
}

/**
 * Resolve qualquer identificador (inclusive ausente ou legado) para um avatar oficial válido.
 */
export function resolvePlayerAvatarId(value: unknown): PlayerAvatarId {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (AVATAR_MAP.has(trimmed)) {
            return trimmed as PlayerAvatarId;
        }
    }
    return DEFAULT_PLAYER_AVATAR_ID;
}

export function getAvatarMeta(avatarId: unknown): PlayerAvatarMeta {
    const resolved = resolvePlayerAvatarId(avatarId);
    return AVATAR_MAP.get(resolved) ?? PLAYER_AVATARS[0];
}
