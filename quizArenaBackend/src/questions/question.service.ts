import { QuestionType, type Question, type QuestionOption } from "@prisma/client";
import { QuestionRepository } from "./question.repository.js";
import {
    validateCreateQuestion,
    type CreateQuestionDto,
} from "./create-question.dto.js";
import { InvalidQuestionDataError } from "./question.errors.js";

export type QuestionWithOptions = Question & {
    options: QuestionOption[];
};

type QuestionRepositoryContract = Pick<
    QuestionRepository,
    "create"
>;

export type CreateQuestionInput = {
    roomId: string;
    statement: string;
    type?: QuestionType;
    options: CreateQuestionDto["options"];
};

export class QuestionService {
    constructor(
        private readonly questionRepository: QuestionRepositoryContract = new QuestionRepository(),
    ) {}

    async createQuestion(
        data: CreateQuestionInput,
    ): Promise<QuestionWithOptions> {
        const validation = validateCreateQuestion(data);

        if (!validation.success) {
            throw new InvalidQuestionDataError(
                "Dados da pergunta inválidos.",
                validation.errors,
            );
        }

        return this.questionRepository.create({
            roomId: validation.data.roomId,
            statement: validation.data.statement,
            type: validation.data.type ?? QuestionType.MULTIPLE_CHOICE,
            options: validation.data.options,
        });
    }
}
