import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { CHOICE_LETTERS, QUESTION_TYPE_LABEL, type Question } from '../../../models/question';

interface QuestionStepProps {
    question: Question;
    questionNumber: number;
    totalQuestions: number;
    remainingSeconds: number;
    timeLimit: number;
    selectedOptionId: string | null;
    hasSubmittedAnswer: boolean;
    isSubmittingAnswer: boolean;
    answerError: string | null;
    onAnswer: (optionId: string) => void;
}

const LOW_TIME_SECONDS = 5;

export default function QuestionStep({
    question,
    questionNumber,
    totalQuestions,
    remainingSeconds,
    timeLimit,
    selectedOptionId,
    hasSubmittedAnswer,
    isSubmittingAnswer,
    answerError,
    onAnswer,
}: QuestionStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();
    const timeRatio = timeLimit > 0 ? remainingSeconds / timeLimit : 0;
    const isLowTime = remainingSeconds <= LOW_TIME_SECONDS;
    const isLocked = hasSubmittedAnswer || isSubmittingAnswer || remainingSeconds <= 0;

    return (
        <section className="play-question" aria-labelledby="play-question-title">
            <div className="play-question__top">
                <span className="play-question__counter">
                    {totalQuestions > 0
                        ? `Pergunta ${questionNumber} de ${totalQuestions}`
                        : `Rodada ${questionNumber}`}{' '}
                    · {QUESTION_TYPE_LABEL[question.type]}
                </span>
                <span
                    className={`play-question__timer${isLowTime ? ' is-low' : ''}`}
                    role="timer"
                    aria-label={`${remainingSeconds} segundos restantes`}
                >
                    {remainingSeconds}s
                </span>
            </div>

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
                {question.options.map((option, index) => {
                    const isSelected = selectedOptionId === option.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            className={`play-option play-option--${index}`}
                            onClick={() => onAnswer(option.id)}
                            disabled={isLocked}
                            style={{
                                outline: isSelected ? '4px solid #ffffff' : undefined,
                                opacity: isLocked && !isSelected ? 0.65 : 1,
                            }}
                        >
                            <span className="play-option__letter" aria-hidden="true">
                                {CHOICE_LETTERS[index]}
                            </span>
                            <span className="play-option__text">{option.text}</span>
                        </button>
                    );
                })}
            </div>

            {answerError && (
                <p className="play-form__error" role="alert" style={{ marginTop: '16px', textAlign: 'center' }}>
                    {answerError}
                </p>
            )}

            {hasSubmittedAnswer && (
                <p
                    className="play-lobby__waiting"
                    role="status"
                    style={{ marginTop: '20px', textAlign: 'center', fontWeight: 600 }}
                >
                    Resposta registrada! Aguardando o encerramento da rodada para revelar o gabarito e a pontuação…
                </p>
            )}

            {!hasSubmittedAnswer && remainingSeconds <= 0 && (
                <p
                    className="play-lobby__waiting"
                    role="status"
                    style={{ marginTop: '20px', textAlign: 'center', fontWeight: 600 }}
                >
                    Tempo esgotado! Aguardando o encerramento da rodada…
                </p>
            )}
        </section>
    );
}
