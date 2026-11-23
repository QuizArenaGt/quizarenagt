import { QuestionType } from "@prisma/client";

export const QUESTION_STATEMENT_MAX_LENGTH = 300;
export const QUESTION_OPTION_MAX_LENGTH = 120;
export const TRUE_FALSE_STANDARD_OPTION_TEXTS = [
    "Verdadeiro",
    "Falso",
] as const;

export type CreateQuestionOptionDto = {
    text: string;
    isCorrect: boolean;
};

export type ValidatedQuestionItemDto = {
    statement: string;
    type: QuestionType;
    options: CreateQuestionOptionDto[];
};

export type CreateQuestionDto = ValidatedQuestionItemDto & {
    roomId: string;
};

export type QuestionItemValidationResult =
    | {
        success: true;
        data: ValidatedQuestionItemDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

export type CreateQuestionValidationResult =
    | {
        success: true;
        data: CreateQuestionDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

const VALID_QUESTION_TYPES: readonly QuestionType[] = [
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.TRUE_FALSE,
];

function isValidQuestionType(value: unknown): value is QuestionType {
    return VALID_QUESTION_TYPES.includes(value as QuestionType);
}

/**
 * Valida os campos de domínio de uma questão (enunciado, tipo e alternativas),
 * reutilizável tanto na criação individual quanto na importação em lote.
 */
export function validateQuestionItem(
    body: unknown,
): QuestionItemValidationResult {
    const errors: Record<string, string> = {};

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
    ) {
        return {
            success: false,
            errors: {
                body: "Os dados da pergunta devem ser um objeto.",
            },
        };
    }

    const payload = body as Record<string, unknown>;
    const { statement, type, options } = payload;

    const normalizedStatement =
        typeof statement === "string" ? statement.trim() : "";

    if (!normalizedStatement) {
        errors.statement = "O enunciado da pergunta é obrigatório.";
    } else if (normalizedStatement.length > QUESTION_STATEMENT_MAX_LENGTH) {
        errors.statement = `O enunciado da pergunta deve ter no máximo ${QUESTION_STATEMENT_MAX_LENGTH} caracteres.`;
    }

    let resolvedType: QuestionType = QuestionType.MULTIPLE_CHOICE;

    if (type !== undefined) {
        if (!isValidQuestionType(type)) {
            errors.type = "O tipo da pergunta é inválido.";
        } else {
            resolvedType = type;
        }
    }

    const normalizedOptions: CreateQuestionOptionDto[] = [];

    if (!Array.isArray(options)) {
        errors.options = "As alternativas devem ser informadas em uma lista.";
    } else if (
        resolvedType === QuestionType.TRUE_FALSE
            ? options.length !== 2
            : options.length < 2 || options.length > 4
    ) {
        errors.options =
            resolvedType === QuestionType.TRUE_FALSE
                ? "Uma pergunta de verdadeiro ou falso deve possuir exatamente 2 alternativas."
                : "Uma pergunta de múltipla escolha deve possuir entre 2 e 4 alternativas.";
    } else {
        let optionValidationError: string | null = null;

        for (const item of options) {
            if (
                typeof item !== "object" ||
                item === null ||
                Array.isArray(item)
            ) {
                optionValidationError =
                    "Cada alternativa deve possuir um texto válido e a indicação se está correta.";
                break;
            }

            const optionPayload = item as Record<string, unknown>;
            const optionText =
                typeof optionPayload.text === "string"
                    ? optionPayload.text.trim()
                    : "";

            if (!optionText || typeof optionPayload.isCorrect !== "boolean") {
                optionValidationError =
                    "Cada alternativa deve possuir um texto válido e a indicação se está correta.";
                break;
            }

            if (optionText.length > QUESTION_OPTION_MAX_LENGTH) {
                optionValidationError = `Cada alternativa deve ter no máximo ${QUESTION_OPTION_MAX_LENGTH} caracteres.`;
                break;
            }

            normalizedOptions.push({
                text: optionText,
                isCorrect: optionPayload.isCorrect,
            });
        }

        if (optionValidationError) {
            errors.options = optionValidationError;
        } else {
            const normalizedOptionTexts = normalizedOptions.map((opt) =>
                opt.text.toLowerCase(),
            );
            const hasDuplicateOptions =
                new Set(normalizedOptionTexts).size !==
                normalizedOptionTexts.length;

            if (hasDuplicateOptions) {
                errors.options =
                    "As alternativas da pergunta não podem se repetir.";
            } else if (
                resolvedType === QuestionType.TRUE_FALSE &&
                !TRUE_FALSE_STANDARD_OPTION_TEXTS.every((standardText) =>
                    normalizedOptions.some((opt) => opt.text === standardText),
                )
            ) {
                errors.options =
                    'Uma pergunta de verdadeiro ou falso deve possuir as alternativas padronizadas "Verdadeiro" e "Falso".';
            } else {
                const correctCount = normalizedOptions.filter(
                    (opt) => opt.isCorrect,
                ).length;

                if (correctCount !== 1) {
                    errors.options =
                        "A pergunta deve possuir exatamente 1 alternativa correta.";
                }
            }
        }
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
            statement: normalizedStatement,
            type: resolvedType,
            options: normalizedOptions,
        },
    };
}

export function validateCreateQuestion(
    body: unknown,
): CreateQuestionValidationResult {
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
    const normalizedRoomId =
        typeof payload.roomId === "string" ? payload.roomId.trim() : "";

    const errors: Record<string, string> = {};

    if (!normalizedRoomId) {
        errors.roomId = "O identificador da sala é obrigatório.";
    }

    const itemValidation = validateQuestionItem(payload);

    if (!itemValidation.success) {
        Object.assign(errors, itemValidation.errors);
    }

    if (Object.keys(errors).length > 0 || !itemValidation.success) {
        return {
            success: false,
            errors,
        };
    }

    return {
        success: true,
        data: {
            roomId: normalizedRoomId,
            statement: itemValidation.data.statement,
            type: itemValidation.data.type,
            options: itemValidation.data.options,
        },
    };
}
