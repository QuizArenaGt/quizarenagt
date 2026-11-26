import {
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_LENGTH,
    validateNewPassword,
} from "./auth-validation.js";

export interface ResetPasswordDTO {
    token: string;
    newPassword: string;
}

export type ResetPasswordValidation =
    | {
          success: true;
          data: ResetPasswordDTO;
      }
    | {
          success: false;
          errors: Record<string, string>;
      };

export const RESET_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;
export const RESET_PASSWORD_MAX_BYTES = PASSWORD_MAX_BYTES;

export function validateResetPassword(
    body: unknown,
): ResetPasswordValidation {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return {
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto.",
            },
        };
    }

    const errors: Record<string, string> = {};
    const payload = body as Record<string, unknown>;
    const { token, newPassword } = payload;

    const cleanToken = typeof token === "string" ? token.trim() : "";
    if (!cleanToken) {
        errors.token = "Token de recuperação inválido.";
    }

    const passwordError = validateNewPassword(newPassword, {
        subject: "A senha",
        requiredMessage: "A nova senha é obrigatória.",
    });
    if (passwordError) {
        errors.newPassword = passwordError;
    }

    if (Object.keys(errors).length > 0) {
        return {
            success: false,
            errors,
        };
    }

    return {
        success: true,
        data: {
            token: cleanToken,
            newPassword: newPassword as string,
        },
    };
}
