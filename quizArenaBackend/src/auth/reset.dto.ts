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
          errors: string[];
      };

export function validateResetPassword(
    body: unknown,
): ResetPasswordValidation {
    if (
        typeof body !== "object" ||
        body === null ||
        !("token" in body) ||
        !("newPassword" in body)
    ) {
        return {
            success: false,
            errors: ["Dados de redefinição de senha inválidos."],
        };
    }

    const { token, newPassword } = body;

    if (typeof token !== "string" || !token.trim()) {
        return {
            success: false,
            errors: ["Token de recuperação inválido."],
        };
    }

    if (
        typeof newPassword !== "string" ||
        newPassword.length < 8
    ) {
        return {
            success: false,
            errors: ["A senha deve possuir pelo menos 8 caracteres."],
        };
    }

    return {
        success: true,
        data: {
            token: token.trim(),
            newPassword,
        },
    };
}