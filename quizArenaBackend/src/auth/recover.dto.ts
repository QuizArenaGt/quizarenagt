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
    const normalizedEmail =
        typeof payload.email === "string"
            ? payload.email.trim().toLowerCase()
            : "";

    if (!normalizedEmail) {
        return {
            success: false,
            errors: {
                email: "O e-mail é obrigatório.",
            },
        };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return {
            success: false,
            errors: {
                email: "Informe um e-mail válido.",
            },
        };
    }

    return {
        success: true,
        data: {
            email: normalizedEmail,
        },
    };
}
