import {
    validateQuestionItem,
    type ValidatedQuestionItemDto,
} from "./create-question.dto.js";

export const MAX_QUESTIONS_PER_IMPORT = 100;
export const IMPORT_QUESTIONS_MAX_PAYLOAD_BYTES = 1024 * 1024;

export type ImportQuestionsDto = {
    questions: ValidatedQuestionItemDto[];
};

export type ImportQuestionsValidationResult =
    | {
        success: true;
        data: ImportQuestionsDto;
    }
    | {
        success: false;
        errors: Record<string, string>;
    };

/**
 * Valida o lote completo de perguntas de um JSON antes de qualquer escrita no banco.
 * Reutiliza `validateQuestionItem` e rejeita duplicatas internas, ausência de perguntas
 * ou lotes acima de 100 questões.
 */
export function validateImportQuestions(
    body: unknown,
): ImportQuestionsValidationResult {
    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
    ) {
        return {
            success: false,
            errors: {
                body: "O corpo da requisição deve ser um objeto JSON.",
            },
        };
    }

    const payload = body as Record<string, unknown>;
    const { questions } = payload;

    if (!Array.isArray(questions)) {
        return {
            success: false,
            errors: {
                questions:
                    'O campo "questions" é obrigatório e deve ser uma lista de perguntas.',
            },
        };
    }

    if (questions.length === 0) {
        return {
            success: false,
            errors: {
                questions: "O arquivo JSON deve conter pelo menos 1 pergunta.",
            },
        };
    }

    if (questions.length > MAX_QUESTIONS_PER_IMPORT) {
        return {
            success: false,
            errors: {
                questions: `Cada importação aceita no máximo ${MAX_QUESTIONS_PER_IMPORT} perguntas.`,
            },
        };
    }

    const errors: Record<string, string> = {};
    const validatedQuestions: ValidatedQuestionItemDto[] = [];
    const seenStatements = new Map<string, number>();

    for (let index = 0; index < questions.length; index += 1) {
        const item = questions[index];
        const itemValidation = validateQuestionItem(item);

        if (!itemValidation.success) {
            for (const [field, message] of Object.entries(
                itemValidation.errors,
            )) {
                errors[`questions[${index}].${field}`] =
                    `Pergunta ${index + 1}: ${message}`;
            }
            continue;
        }

        const normalizedStatementKey =
            itemValidation.data.statement.toLowerCase();
        const duplicateOfIndex = seenStatements.get(normalizedStatementKey);

        if (duplicateOfIndex !== undefined) {
            errors[`questions[${index}].statement`] =
                `Pergunta ${index + 1}: enunciado duplicado em relação à pergunta ${duplicateOfIndex + 1}.`;
            continue;
        }

        seenStatements.set(normalizedStatementKey, index);
        validatedQuestions.push(itemValidation.data);
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
            questions: validatedQuestions,
        },
    };
}
