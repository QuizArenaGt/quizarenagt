import { validateNormalizedEmail } from "./auth-validation.js";

export interface RecoverPasswordDTO {
    email: string;
}

export type RecoverPasswordValidation =
    | {
          success: true;
          data: RecoverPasswordDTO;
      }
    | {
          success: false;
          errors: Record<string, string>;
      };

export function validateRecoverPassword(
    body: unknown,
): RecoverPasswordValidation {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return {
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto.",
            },
        };
    }

    const payload = body as Record<string, unknown>;
    const emailValidation = validateNormalizedEmail(payload.email);

    if (!emailValidation.success) {
        return {
            success: false,
            errors: {
                email: emailValidation.error,
            },
        };
    }

    return {
        success: true,
        data: {
            email: emailValidation.email,
        },
    };
}
