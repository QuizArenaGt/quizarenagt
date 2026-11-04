
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

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
        errors.email = "O e-mail é obrigatório.";
    } else if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        errors.email = "Informe um e-mail válido.";
    }

    if (typeof password !== "string" || !password) {
        errors.password = "A senha é obrigatória.";
    } else if (password.length < 8) {
        errors.password = "A senha deve possuir pelo menos 8 caracteres.";
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
            name: (name as string).trim(),
            email: normalizedEmail,
            password: password as string,
        },
    };
}
