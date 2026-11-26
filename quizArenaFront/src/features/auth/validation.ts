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
export const AUTH_PASSWORD_LETTER_PATTERN = /\p{L}/u;
export const AUTH_PASSWORD_NUMBER_PATTERN = /[0-9]/;

export type LoginField = 'email' | 'password';
export type RegisterField = 'name' | 'email' | 'password' | 'confirmPassword';
export type RecoverPasswordField = 'email';
export type ResetPasswordField = 'newPassword' | 'confirmPassword';
export type ChangePasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

export type AuthFieldErrors<TField extends string> = Partial<Record<TField, string>>;

export interface PasswordRequirementCheck {
    key: 'minLength' | 'hasLetter' | 'hasNumber';
    label: string;
    met: boolean;
}

const textEncoder = new TextEncoder();

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function getPasswordRequirements(password: string): PasswordRequirementCheck[] {
    return [
        {
            key: 'minLength',
            label: `Mínimo de ${AUTH_PASSWORD_MIN_LENGTH} caracteres`,
            met: password.length >= AUTH_PASSWORD_MIN_LENGTH,
        },
        {
            key: 'hasLetter',
            label: 'Pelo menos uma letra',
            met: AUTH_PASSWORD_LETTER_PATTERN.test(password),
        },
        {
            key: 'hasNumber',
            label: 'Pelo menos um número',
            met: AUTH_PASSWORD_NUMBER_PATTERN.test(password),
        },
    ];
}

function validateEmailValue(email: string): string | undefined {
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return 'Informe seu e-mail.';
    }
    if (!AUTH_EMAIL_PATTERN.test(normalized)) {
        return 'Informe um e-mail válido (ex.: nome@dominio.com).';
    }
    return undefined;
}

function validateNewPasswordValue(
    password: string,
    options: {
        subject: string;
        requiredMessage: string;
    },
): string | undefined {
    if (!password) {
        return options.requiredMessage;
    }
    if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
        return `${options.subject} deve possuir pelo menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`;
    }
    if (textEncoder.encode(password).length > AUTH_PASSWORD_MAX_BYTES) {
        return `${options.subject} deve possuir no máximo ${AUTH_PASSWORD_MAX_BYTES} caracteres.`;
    }
    if (!AUTH_PASSWORD_LETTER_PATTERN.test(password)) {
        return `${options.subject} deve conter pelo menos uma letra.`;
    }
    if (!AUTH_PASSWORD_NUMBER_PATTERN.test(password)) {
        return `${options.subject} deve conter pelo menos um número.`;
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

    // Login não aplica regras de força de senha para manter compatibilidade com contas antigas.
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

    const passwordError = validateNewPasswordValue(input.password, {
        subject: 'A senha',
        requiredMessage: 'Informe uma senha.',
    });
    if (passwordError) {
        errors.password = passwordError;
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

export function validateResetPasswordFields(input: {
    newPassword: string;
    confirmPassword: string;
}): AuthFieldErrors<ResetPasswordField> {
    const errors: AuthFieldErrors<ResetPasswordField> = {};

    const newPasswordError = validateNewPasswordValue(input.newPassword, {
        subject: 'A senha',
        requiredMessage: 'Informe uma nova senha.',
    });
    if (newPasswordError) {
        errors.newPassword = newPasswordError;
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

    const newPasswordError = validateNewPasswordValue(input.newPassword, {
        subject: 'A nova senha',
        requiredMessage: 'Informe uma nova senha.',
    });
    if (newPasswordError) {
        errors.newPassword = newPasswordError;
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
