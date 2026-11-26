
import {
    validateNewPassword,
    validateNormalizedEmail,
} from "./auth-validation.js";

export type RegisterUserDto = {
    name: string;
    email: string;
    password: string;
};

export type RegisterValidationResult =
    | {
        success: true;
        data: RegisterUserDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

export function validateRegisterUser (body: unknown): RegisterValidationResult {
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
    const { name, email, password } = payload;

    if (typeof name !== "string" || !name.trim()) {
        errors.name = "O nome é obrigatório.";
    }

    const emailValidation = validateNormalizedEmail(email);
    if (!emailValidation.success) {
        errors.email = emailValidation.error;
    }

    const passwordError = validateNewPassword(password, {
        subject: "A senha",
    });
    if (passwordError) {
        errors.password = passwordError;
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
            name: (name as string).trim(),
            email: emailValidation.email,
            password: password as string,
        },
    };
}
