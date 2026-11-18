/*
 * SERVICE TEMPORÁRIO — perfil do usuário.
 *
 * O backend ainda não tem rota para atualizar o usuário nem o campo
 * telefone. Por isso:
 *  - nome e e-mail são lidos/gravados no mesmo item "user" do localStorage
 *    que o LoginForm já usa (contrato AuthUser). No próximo login, o
 *    LoginForm grava de novo os dados do servidor, e a edição local se perde;
 *  - o telefone fica em um item separado, por id de usuário;
 *  - a licença é um dado fixo de demonstração.
 *
 * Quando existir a API (ex.: GET/PATCH /users/me), basta trocar estas
 * funções mantendo as assinaturas.
 */
import type { AuthUser } from '../features/auth/types/auth';
import type { License, UserProfile } from '../models/profile';

const USER_KEY = 'user';
const PHONES_KEY = 'quizarena:profile-phones';

function readPhones(): Record<string, string> {
    try {
        const stored = localStorage.getItem(PHONES_KEY);
        const parsed: unknown = stored ? JSON.parse(stored) : {};
        return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
    } catch {
        return {};
    }
}

/** Lê o usuário logado; null se não houver sessão. */
export function getProfile(): UserProfile | null {
    try {
        const stored = localStorage.getItem(USER_KEY);
        if (!stored) return null;
        const user = JSON.parse(stored) as AuthUser;
        if (!user || typeof user.name !== 'string') return null;
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: readPhones()[user.id] ?? '',
        };
    } catch {
        return null;
    }
}

export async function updateProfile(profile: UserProfile): Promise<UserProfile> {
    // Mantém o formato AuthUser (id, name, email, role) que o resto do
    // sistema espera encontrar em "user".
    const user: AuthUser = { id: profile.id, name: profile.name, email: profile.email, role: profile.role };
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    const phones = readPhones();
    phones[profile.id] = profile.phone;
    localStorage.setItem(PHONES_KEY, JSON.stringify(phones));

    return profile;
}

/** Licença de demonstração: o sistema ainda não possui planos reais. */
export function getLicense(): License {
    return {
        isActive: true,
        planName: 'Plano Acadêmico',
        description: 'Acesso às funcionalidades da plataforma para uso educacional.',
        isDemo: true,
    };
}
