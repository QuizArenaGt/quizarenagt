
import { validateNormalizedEmail } from "./auth-validation.js";

export type LoginDto = {
    email: string;
    password: string;
};

export type LoginValidationResult =
    | {
        success: true;
        data: LoginDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

export function validateLogin(body: unknown): LoginValidationResult {
    const errors: Record<string, string> = {};

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
    ) {
        return {
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto.",
            },
        };
    }

    const payload = body as Record<string, unknown>;
    const { email, password } = payload;

    const emailValidation = validateNormalizedEmail(email);
    if (!emailValidation.success) {
        errors.email = emailValidation.error;
    }

    // Login não aplica regras de força de senha para não bloquear contas antigas.
    if (typeof password !== "string" || !password) {
        errors.password = "A senha é obrigatória.";
    }

    if (Object.keys(errors).length > 0 || !emailValidation.success) {
        return {
            success: false,
            errors,
        };
    }

    return {
        success: true,
        data: {
            email: emailValidation.email,
            password: password as string,
        },
    };
}
