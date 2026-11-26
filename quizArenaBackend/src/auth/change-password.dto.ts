import {
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_LENGTH,
    validateNewPassword,
} from "./auth-validation.js";

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

export const CHANGE_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;
export const CHANGE_PASSWORD_MAX_BYTES = PASSWORD_MAX_BYTES;

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

    const newPasswordError = validateNewPassword(newPassword, {
        subject: "A nova senha",
    });
    if (newPasswordError) {
        errors.newPassword = newPasswordError;
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
