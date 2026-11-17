
export type SubmitRoundAnswerDto = {
    optionId: string;
};

export type SubmitRoundAnswerValidationResult =
    | {
        success: true;
        data: SubmitRoundAnswerDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateSubmitRoundAnswer(
    body: unknown,
): SubmitRoundAnswerValidationResult {
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
    const optionId =
        typeof payload.optionId === "string"
            ? payload.optionId.trim()
            : "";

    if (!UUID_REGEX.test(optionId)) {
        return {
            success: false,
            errors: {
                optionId: "O identificador da alternativa deve ser um UUID válido.",
            },
        };
    }

    return {
        success: true,
        data: {
            optionId,
        },
    };
}
