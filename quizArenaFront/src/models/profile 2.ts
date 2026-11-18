/*
 * MODEL — perfil do usuário e licença.
 *
 * Nome, e-mail e perfil (role) vêm do backend (AuthUser, gravado pelo
 * login). Telefone, licença e plano ainda NÃO existem no backend: o
 * telefone é guardado só no navegador e a licença é um dado fixo de
 * demonstração, identificado como tal na tela.
 */
import type { AuthUser } from '../features/auth/types/auth';

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    role: AuthUser['role'];
    /** Apenas dígitos (DDD + número). */
    phone: string;
}

export interface License {
    isActive: boolean;
    planName: string;
    description: string;
    /** Indica que a licença é simulada (não vem do servidor). */
    isDemo: boolean;
}

/*
 * Rótulos dos perfis do backend. Interpretação adotada: HOST é quem
 * conduz as partidas (professor). Ajustar se a equipe definir outro uso.
 */
export const ROLE_LABEL: Record<AuthUser['role'], string> = {
    USER: 'Usuário',
    HOST: 'Professor',
    ADMIN: 'Administrador',
};

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 100;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 11;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProfileField = 'name' | 'email' | 'phone';
export type ProfileErrors = Partial<Record<ProfileField, string>>;

/** Mantém só os dígitos do telefone, no máximo 11 (DDD + celular). */
export function sanitizePhone(value: string): string {
    return value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS);
}

/** Formata para exibição: (11) 91234-5678 ou (11) 1234-5678. */
export function formatPhone(digits: string): string {
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    const splitAt = digits.length === PHONE_MAX_DIGITS ? 5 : 4;
    if (rest.length <= splitAt) return `(${ddd}) ${rest}`;
    return `(${ddd}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`;
}

/** Valida o perfil e devolve as mensagens de erro por campo. */
export function validateProfile(profile: Pick<UserProfile, 'name' | 'email' | 'phone'>): ProfileErrors {
    const errors: ProfileErrors = {};
    const name = profile.name.trim();

    if (name.length < NAME_MIN_LENGTH) {
        errors.name = `O nome precisa ter pelo menos ${NAME_MIN_LENGTH} caracteres.`;
    } else if (name.length > NAME_MAX_LENGTH) {
        errors.name = `O nome pode ter no máximo ${NAME_MAX_LENGTH} caracteres.`;
    }

    if (!EMAIL_PATTERN.test(profile.email.trim())) {
        errors.email = 'Informe um e-mail válido.';
    }

    // Telefone é opcional; se preenchido, precisa estar completo.
    if (profile.phone && (profile.phone.length < PHONE_MIN_DIGITS || profile.phone.length > PHONE_MAX_DIGITS)) {
        errors.phone = 'Informe o telefone com DDD (10 ou 11 dígitos).';
    }

    return errors;
}

/** Iniciais para o avatar (ex.: "Ana Cassi" → "AC"). */
export function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toUpperCase();
}
