import { QuestionType } from "@prisma/client";

export function validRoomQuestions(quantity = 5) {
    return Array.from({ length: quantity }, (_, index) => ({
        statement: `Pergunta de teste ${index + 1}`,
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Alternativa 1", isCorrect: true },
            { text: "Alternativa 2", isCorrect: false },
            { text: "Alternativa 3", isCorrect: false },
            { text: "Alternativa 4", isCorrect: false },
        ],
    }));
}