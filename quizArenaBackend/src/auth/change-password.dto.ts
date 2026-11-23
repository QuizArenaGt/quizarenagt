export interface ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}

export type ChangePasswordValidation =
    | {
          success: true;
          data: ChangePasswordDto;
      }
    | {
          success: false;
          errors: Record<string, string>;
      };

export const CHANGE_PASSWORD_MIN_LENGTH = 8;
export const CHANGE_PASSWORD_MAX_BYTES = 72;

export function validateChangePassword(
    body: unknown,
): ChangePasswordValidation {
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
    const { currentPassword, newPassword } = payload;

    if (typeof currentPassword !== "string" || !currentPassword) {
        errors.currentPassword = "A senha atual é obrigatória.";
    }

    if (typeof newPassword !== "string" || !newPassword) {
        errors.newPassword = "A nova senha é obrigatória.";
    } else if (newPassword.length < CHANGE_PASSWORD_MIN_LENGTH) {
        errors.newPassword = `A nova senha deve possuir pelo menos ${CHANGE_PASSWORD_MIN_LENGTH} caracteres.`;
    } else if (
        Buffer.byteLength(newPassword, "utf8") > CHANGE_PASSWORD_MAX_BYTES
    ) {
        errors.newPassword = `A nova senha deve possuir no máximo ${CHANGE_PASSWORD_MAX_BYTES} caracteres.`;
    } else if (
        typeof currentPassword === "string" &&
        currentPassword.length > 0 &&
        newPassword === currentPassword
    ) {
        errors.newPassword =
            "A nova senha deve ser diferente da senha atual.";
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
            currentPassword: currentPassword as string,
            newPassword: newPassword as string,
        },
    };
}
