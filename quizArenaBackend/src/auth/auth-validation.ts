export const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const PASSWORD_LETTER_PATTERN = /\p{L}/u;
const PASSWORD_NUMBER_PATTERN = /[0-9]/;

export type EmailValidationResult =
    | {
          success: true;
          email: string;
      }
    | {
          success: false;
          error: string;
      };

/**
 * Normaliza e-mails removendo apenas espaços externos e convertendo para minúsculas.
 * Espaços internos são mantidos para que a validação rejeite endereços malformados.
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function validateNormalizedEmail(email: unknown): EmailValidationResult {
    const normalizedEmail =
        typeof email === "string" ? normalizeEmail(email) : "";

    if (!normalizedEmail) {
        return {
            success: false,
            error: "O e-mail é obrigatório.",
        };
    }

    if (!AUTH_EMAIL_PATTERN.test(normalizedEmail)) {
        return {
            success: false,
            error: "Informe um e-mail válido.",
        };
    }

    return {
        success: true,
        email: normalizedEmail,
    };
}

/**
 * Valida novas senhas (cadastro, redefinição e alteração) sem aplicar `trim()`
 * ou qualquer normalização que altere os caracteres digitados.
 */
export function validateNewPassword(
    password: unknown,
    options?: {
        subject?: string;
        requiredMessage?: string;
    },
): string | null {
    const subject = options?.subject ?? "A senha";
    const requiredMessage =
        options?.requiredMessage ?? `${subject} é obrigatória.`;

    if (typeof password !== "string" || !password) {
        return requiredMessage;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        return `${subject} deve possuir pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    }

    if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
        return `${subject} deve possuir no máximo ${PASSWORD_MAX_BYTES} caracteres.`;
    }

    if (!PASSWORD_LETTER_PATTERN.test(password)) {
        return `${subject} deve conter pelo menos uma letra.`;
    }

    if (!PASSWORD_NUMBER_PATTERN.test(password)) {
        return `${subject} deve conter pelo menos um número.`;
    }

    return null;
}
