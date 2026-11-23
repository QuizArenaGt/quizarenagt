interface HttpErrorLike {
    status: number;
    message?: string;
    errors?: Record<string, string>;
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        'status' in value &&
        typeof (value as { status: unknown }).status === 'number'
    );
}

export const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const AUTH_NAME_MIN_LENGTH = 2;
export const AUTH_NAME_MAX_LENGTH = 100;
export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_BYTES = 72;

export type LoginField = 'email' | 'password';
export type RegisterField = 'name' | 'email' | 'password' | 'confirmPassword';
export type RecoverPasswordField = 'email';
export type ResetPasswordField = 'newPassword' | 'confirmPassword';
export type ChangePasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

export type AuthFieldErrors<TField extends string> = Partial<Record<TField, string>>;

function validateEmailValue(email: string): string | undefined {
    const trimmed = email.trim();
    if (!trimmed) {
        return 'Informe seu e-mail.';
    }
    if (!AUTH_EMAIL_PATTERN.test(trimmed)) {
        return 'Informe um e-mail válido (ex.: nome@dominio.com).';
    }
    return undefined;
}

export function validateLoginFields(input: {
    email: string;
    password: string;
}): AuthFieldErrors<LoginField> {
    const errors: AuthFieldErrors<LoginField> = {};

    const emailError = validateEmailValue(input.email);
    if (emailError) {
        errors.email = emailError;
    }

    if (!input.password) {
        errors.password = 'Informe sua senha.';
    }

    return errors;
}

export function validateRegisterFields(input: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
}): AuthFieldErrors<RegisterField> {
    const errors: AuthFieldErrors<RegisterField> = {};
    const trimmedName = input.name.trim();

    if (!trimmedName) {
        errors.name = 'Informe seu nome.';
    } else if (trimmedName.length < AUTH_NAME_MIN_LENGTH) {
        errors.name = `O nome deve ter pelo menos ${AUTH_NAME_MIN_LENGTH} caracteres.`;
    } else if (trimmedName.length > AUTH_NAME_MAX_LENGTH) {
        errors.name = `O nome pode ter no máximo ${AUTH_NAME_MAX_LENGTH} caracteres.`;
    }

    const emailError = validateEmailValue(input.email);
    if (emailError) {
        errors.email = emailError;
    }

    if (!input.password) {
        errors.password = 'Informe uma senha.';
    } else if (input.password.length < AUTH_PASSWORD_MIN_LENGTH) {
        errors.password = `A senha deve possuir pelo menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`;
    }

    if (!input.confirmPassword) {
        errors.confirmPassword = 'Confirme sua senha.';
    } else if (input.password !== input.confirmPassword) {
        errors.confirmPassword = 'As senhas não coincidem.';
    }

    return errors;
}

export function validateRecoverPasswordFields(input: {
    email: string;
}): AuthFieldErrors<RecoverPasswordField> {
    const errors: AuthFieldErrors<RecoverPasswordField> = {};
    const emailError = validateEmailValue(input.email);
    if (emailError) {
        errors.email = emailError;
    }
    return errors;
}

const textEncoder = new TextEncoder();

export function validateResetPasswordFields(input: {
    newPassword: string;
    confirmPassword: string;
}): AuthFieldErrors<ResetPasswordField> {
    const errors: AuthFieldErrors<ResetPasswordField> = {};

    if (!input.newPassword) {
        errors.newPassword = 'Informe uma nova senha.';
    } else if (input.newPassword.length < AUTH_PASSWORD_MIN_LENGTH) {
        errors.newPassword = `A senha deve possuir pelo menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`;
    } else if (textEncoder.encode(input.newPassword).length > AUTH_PASSWORD_MAX_BYTES) {
        errors.newPassword = `A senha deve possuir no máximo ${AUTH_PASSWORD_MAX_BYTES} caracteres.`;
    }

    if (!input.confirmPassword) {
        errors.confirmPassword = 'Confirme sua nova senha.';
    } else if (input.newPassword !== input.confirmPassword) {
        errors.confirmPassword = 'As senhas não coincidem.';
    }

    return errors;
}

export function validateChangePasswordFields(input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}): AuthFieldErrors<ChangePasswordField> {
    const errors: AuthFieldErrors<ChangePasswordField> = {};

    if (!input.currentPassword) {
        errors.currentPassword = 'Informe sua senha atual.';
    }

    if (!input.newPassword) {
        errors.newPassword = 'Informe uma nova senha.';
    } else if (input.newPassword.length < AUTH_PASSWORD_MIN_LENGTH) {
        errors.newPassword = `A nova senha deve possuir pelo menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`;
    } else if (textEncoder.encode(input.newPassword).length > AUTH_PASSWORD_MAX_BYTES) {
        errors.newPassword = `A nova senha deve possuir no máximo ${AUTH_PASSWORD_MAX_BYTES} caracteres.`;
    } else if (input.currentPassword && input.newPassword === input.currentPassword) {
        errors.newPassword = 'A nova senha deve ser diferente da senha atual.';
    }

    if (!input.confirmPassword) {
        errors.confirmPassword = 'Confirme sua nova senha.';
    } else if (input.newPassword !== input.confirmPassword) {
        errors.confirmPassword = 'As senhas não coincidem.';
    }

    return errors;
}

export function formatAuthApiError(error: unknown, fallbackMessage: string): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 400 && error.errors) {
            const firstFieldMessage = Object.values(error.errors).find(Boolean);
            if (firstFieldMessage) {
                return firstFieldMessage;
            }
        }

        if (error.status >= 500) {
            return 'Não foi possível concluir a operação no servidor. Tente novamente em instantes.';
        }

        if (typeof error.message === 'string' && error.message.trim()) {
            return error.message.trim();
        }
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }

    return fallbackMessage;
}
