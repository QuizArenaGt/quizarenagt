export interface RecoverPasswordDTO {
    email: string;
}

export interface RecoverPasswordValidation {
    success: boolean;
    data?: RecoverPasswordDTO;
    errors?: string[];
}

export function validateRecoverPassword(
    body: unknown,
): RecoverPasswordValidation {
    if (
        typeof body !== "object" ||
        body === null ||
        !("email" in body)
    ) {
        return {
            success: false,
            errors: ["E-mail inválido."],
        };
    }

    const email = body.email;

    if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        console.log("Email inválido:", email);
        return {
            success: false,
            errors: ["Informe um e-mail válido."],
        };
    }

    return {
        success: true,
        data: {
            email: email.trim().toLowerCase(),
        },
    };
}

