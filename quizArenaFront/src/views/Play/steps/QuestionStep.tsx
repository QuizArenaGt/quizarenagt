import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { CHOICE_LETTERS, QUESTION_TYPE_LABEL, type Question } from '../../../models/question';

interface QuestionStepProps {
    question: Question;
    questionNumber: number;
    totalQuestions: number;
    remainingSeconds: number;
    timeLimit: number;
    onAnswer: (optionId: string) => void;
}

/** Abaixo deste tempo o cronômetro muda de cor para avisar o aluno. */
const LOW_TIME_SECONDS = 5;

export default function QuestionStep({
    question,
    questionNumber,
    totalQuestions,
    remainingSeconds,
    timeLimit,
    onAnswer,
}: QuestionStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();
    const timeRatio = timeLimit > 0 ? remainingSeconds / timeLimit : 0;
    const isLowTime = remainingSeconds <= LOW_TIME_SECONDS;

    return (
        <section className="play-question" aria-labelledby="play-question-title">
            <div className="play-question__top">
                <span className="play-question__counter">
                    Pergunta {questionNumber} de {totalQuestions} · {QUESTION_TYPE_LABEL[question.type]}
                </span>
                <span
                    className={`play-question__timer${isLowTime ? ' is-low' : ''}`}
                    role="timer"
                    aria-label={`${remainingSeconds} segundos restantes`}
                >
                    {remainingSeconds}s
                </span>
            </div>

            {/* Barra de tempo: só visual; o valor acessível está no timer acima */}
            <div className="play-question__progress" aria-hidden="true">
                <span
                    className={isLowTime ? 'is-low' : undefined}
                    style={{ transform: `scaleX(${timeRatio})` }}
                />
            </div>

            <h1 id="play-question-title" ref={titleRef} tabIndex={-1} className="play-question__statement">
                {question.statement}
            </h1>

            <div
                className={`play-options play-options--${question.options.length === 2 ? 'two' : 'many'}`}
                role="group"
                aria-label="Alternativas"
            >
                {question.options.map((option, index) => (
                    <button
                        key={option.id}
                        type="button"
                        className={`play-option play-option--${index}`}
                        onClick={() => onAnswer(option.id)}
                    >
                        <span className="play-option__letter" aria-hidden="true">
                            {CHOICE_LETTERS[index]}
                        </span>
                        <span className="play-option__text">{option.text}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}
