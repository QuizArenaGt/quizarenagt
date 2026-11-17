import { QuestionType } from "@prisma/client";

export type CreateQuestionOptionDto = {
    text: string;
    isCorrect: boolean;
};

export type CreateQuestionDto = {
    roomId: string;
    statement: string;
    type: QuestionType;
    options: CreateQuestionOptionDto[];
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

export function validateCreateQuestion(
    body: unknown,
): CreateQuestionValidationResult {
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
    const { roomId, statement, type, options } = payload;

    const normalizedRoomId =
        typeof roomId === "string" ? roomId.trim() : "";

    if (!normalizedRoomId) {
        errors.roomId = "O identificador da sala é obrigatório.";
    }

    const normalizedStatement =
        typeof statement === "string" ? statement.trim() : "";

    if (!normalizedStatement) {
        errors.statement = "O enunciado da pergunta é obrigatório.";
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
    } else if (options.length !== 4) {
        errors.options = "A pergunta deve possuir exatamente 4 alternativas.";
    } else {
        let hasInvalidOption = false;

        for (const item of options) {
            if (
                typeof item !== "object" ||
                item === null ||
                Array.isArray(item)
            ) {
                hasInvalidOption = true;
                break;
            }

            const optionPayload = item as Record<string, unknown>;
            const optionText =
                typeof optionPayload.text === "string"
                    ? optionPayload.text.trim()
                    : "";

            if (!optionText || typeof optionPayload.isCorrect !== "boolean") {
                hasInvalidOption = true;
                break;
            }

            normalizedOptions.push({
                text: optionText,
                isCorrect: optionPayload.isCorrect,
            });
        }

        if (hasInvalidOption) {
            errors.options =
                "Cada alternativa deve possuir um texto válido e a indicação se está correta.";
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

    if (Object.keys(errors).length > 0) {
        return {
            success: false,
            errors,
        };
    }

    return {
        success: true,
        data: {
            roomId: normalizedRoomId,
            statement: normalizedStatement,
            type: resolvedType,
            options: normalizedOptions,
        },
    };
}
