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

export const RESET_PASSWORD_MIN_LENGTH = 8;
export const RESET_PASSWORD_MAX_BYTES = 72;

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

    if (typeof newPassword !== "string" || !newPassword) {
        errors.newPassword = "A nova senha é obrigatória.";
    } else if (newPassword.length < RESET_PASSWORD_MIN_LENGTH) {
        errors.newPassword = `A senha deve possuir pelo menos ${RESET_PASSWORD_MIN_LENGTH} caracteres.`;
    } else if (Buffer.byteLength(newPassword, "utf8") > RESET_PASSWORD_MAX_BYTES) {
        errors.newPassword = `A senha deve possuir no máximo ${RESET_PASSWORD_MAX_BYTES} caracteres.`;
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
