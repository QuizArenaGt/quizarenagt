import { useEffect, useRef, useState } from 'react';
import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import {
    CHOICE_LETTERS,
    QUESTION_TYPE_LABEL,
    getQuestionOptionTone,
    type Question,
} from '../../../models/question';
import {
    resolveQuestionVisibilityState,
    toggleQuestionVisibilityPreference,
} from './questionVisibility';

interface QuestionStepProps {
    question: Question;
    questionNumber: number;
    totalQuestions: number;
    remainingSeconds: number | null;
    timeLimit: number;
    selectedOptionId: string | null;
    hasSubmittedAnswer: boolean;
    isSubmittingAnswer: boolean;
    answerError: string | null;
    onAnswer: (optionId: string) => void;
}

const LOW_TIME_SECONDS = 5;
const WARN_TIME_SECONDS = 10;

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
    const [manualVisibilityOverride, setManualVisibilityOverride] = useState<boolean | null>(null);
    const hiddenCardRef = useRef<HTMLDivElement | null>(null);
    const submittedStatusRef = useRef<HTMLDivElement | null>(null);
    const pendingFocusTargetRef = useRef<'show' | 'hide' | null>(null);
    const prevHiddenRef = useRef(false);

    const { canHideQuestion, isQuestionHidden } = resolveQuestionVisibilityState({
        hasSubmittedAnswer,
        isSubmittingAnswer,
        answerError,
        manualVisibilityOverride,
    });

    useEffect(() => {
        const wasHidden = prevHiddenRef.current;
        prevHiddenRef.current = isQuestionHidden;
        const pending = pendingFocusTargetRef.current;
        pendingFocusTargetRef.current = null;

        if ((pending === 'show' || (!wasHidden && isQuestionHidden)) && isQuestionHidden) {
            hiddenCardRef.current?.querySelector('button')?.focus();
        } else if (pending === 'hide' && !isQuestionHidden) {
            submittedStatusRef.current
                ?.querySelector<HTMLButtonElement>('.play-question__visibility-btn')
                ?.focus();
        }
    }, [isQuestionHidden]);

    function handleHideQuestion() {
        const nextOverride = toggleQuestionVisibilityPreference(manualVisibilityOverride, {
            hasSubmittedAnswer,
            isSubmittingAnswer,
            answerError,
        });
        if (nextOverride === null) return;
        pendingFocusTargetRef.current = 'show';
        setManualVisibilityOverride(nextOverride);
    }

    function handleShowQuestion() {
        const nextOverride = toggleQuestionVisibilityPreference(manualVisibilityOverride, {
            hasSubmittedAnswer,
            isSubmittingAnswer,
            answerError,
        });
        if (nextOverride === null) return;
        pendingFocusTargetRef.current = 'hide';
        setManualVisibilityOverride(nextOverride);
    }

    const isTimeSynced = remainingSeconds !== null;
    const timeRatio =
        timeLimit > 0
            ? isTimeSynced
                ? Math.max(0, Math.min(1, remainingSeconds / timeLimit))
                : 1
            : 0;
    const isExpired = isTimeSynced && remainingSeconds <= 0;
    const isLowTime = isTimeSynced && !isExpired && remainingSeconds <= LOW_TIME_SECONDS;
    const isWarnTime =
        isTimeSynced &&
        !isExpired &&
        !isLowTime &&
        timeLimit > WARN_TIME_SECONDS &&
        remainingSeconds <= WARN_TIME_SECONDS;
    const isLocked = hasSubmittedAnswer || isSubmittingAnswer || isExpired;

    const timerStateClass = isExpired
        ? 'is-expired'
        : isLowTime
          ? 'is-low'
          : isWarnTime
            ? 'is-warn'
            : '';

    return (
        <section className="play-question" aria-labelledby="play-question-title">
            <div className="play-question__top">
                <div className="play-question__meta">
                    <span className="play-question__counter">
                        {totalQuestions > 0
                            ? `Pergunta ${questionNumber} de ${totalQuestions}`
                            : `Rodada ${questionNumber}`}
                    </span>
                    <Badge variant="neutral" className="play-question__type-badge">
                        {QUESTION_TYPE_LABEL[question.type]}
                    </Badge>
                </div>

                <div
                    className={`play-question__timer${timerStateClass ? ` ${timerStateClass}` : ''}`}
                    role="timer"
                    aria-label={
                        !isTimeSynced
                            ? 'Sincronizando cronômetro com o servidor'
                            : isExpired
                              ? 'Tempo encerrado'
                              : `${remainingSeconds} segundos restantes`
                    }
                >
                    <span className="play-question__timer-value">
                        {isTimeSynced ? `${remainingSeconds}s` : '--s'}
                    </span>
                    <span className="play-question__timer-label">
                        {!isTimeSynced
                            ? 'Sincronizando'
                            : isExpired
                              ? 'Encerrado'
                              : 'restantes'}
                    </span>
                </div>
            </div>

            <div className="play-question__progress" aria-hidden="true">
                <span
                    className={timerStateClass || undefined}
                    style={{ transform: `scaleX(${timeRatio})` }}
                />
            </div>

            {isQuestionHidden ? (
                <div
                    ref={hiddenCardRef}
                    className="play-card play-card--wide play-card--center play-question__hidden-card"
                    role="status"
                    aria-live="polite"
                >
                    <span className="play-question__hidden-icon" aria-hidden="true">
                        <Icon name="check" size={32} />
                    </span>
                    <h1 id="play-question-title" className="play-card__title">
                        Resposta enviada!
                    </h1>
                    <p className="play-card__text">Aguardando os demais jogadores...</p>
                    <div className="play-question__hidden-actions">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            className="play-question__visibility-btn"
                            onClick={handleShowQuestion}
                        >
                            Mostrar pergunta
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="play-question__statement-card">
                        <h1 id="play-question-title" ref={titleRef} tabIndex={-1} className="play-question__statement">
                            {question.statement}
                        </h1>
                    </div>

                    <div
                        className={`play-options play-options--${question.options.length === 2 ? 'two' : 'many'}`}
                        role="group"
                        aria-label="Alternativas"
                    >
                        {question.options.map((option, index) => {
                            const isSelected = selectedOptionId === option.id;
                            const optionTone = getQuestionOptionTone(
                                question.type,
                                option.text,
                                index,
                                question.options,
                            );
                            const optionClasses = [
                                'play-option',
                                `play-option--${optionTone}`,
                                isSelected ? 'play-option--selected' : '',
                                isLocked && !isSelected ? 'play-option--unselected' : '',
                            ]
                                .filter(Boolean)
                                .join(' ');

                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={optionClasses}
                                    onClick={() => onAnswer(option.id)}
                                    disabled={isLocked}
                                    aria-pressed={isSelected}
                                >
                                    <span className="play-option__letter" aria-hidden="true">
                                        {CHOICE_LETTERS[index]}
                                    </span>
                                    <span className="play-option__text">{option.text}</span>
                                    {isSelected && (
                                        <span className="play-option__selected-tag">
                                            <Icon name="check" size={14} />
                                            {isSubmittingAnswer && !hasSubmittedAnswer ? 'Enviando…' : 'Selecionada'}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {answerError && (
                        <Alert variant="error" className="play-question__error-alert">
                            {answerError}
                        </Alert>
                    )}

                    {isSubmittingAnswer && !hasSubmittedAnswer && (
                        <div className="play-question__status play-question__status--submitting" role="status">
                            <span className="play-question__status-badge" aria-hidden="true">
                                <Icon name="bolt" size={16} />
                            </span>
                            <div className="play-question__status-text">
                                <strong>Registrando sua resposta…</strong>
                                <span>Confirmando envio com o servidor.</span>
                            </div>
                        </div>
                    )}

                    {hasSubmittedAnswer && (
                        <div
                            ref={submittedStatusRef}
                            className="play-question__status play-question__status--submitted"
                            role="status"
                        >
                            <div className="play-question__status-main">
                                <span className="play-question__status-badge" aria-hidden="true">
                                    <Icon name="check" size={16} />
                                </span>
                                <div className="play-question__status-text">
                                    <strong>Resposta registrada e bloqueada!</strong>
                                    <span>
                                        Sua escolha já foi computada e não pode ser alterada. Aguarde os demais
                                        jogadores ou o término do tempo para ver o gabarito.
                                    </span>
                                </div>
                            </div>
                            {canHideQuestion && (
                                <div className="play-question__status-actions">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="play-question__visibility-btn"
                                        onClick={handleHideQuestion}
                                    >
                                        Ocultar pergunta
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {!hasSubmittedAnswer && !isSubmittingAnswer && isExpired && (
                        <div className="play-question__status play-question__status--timeout" role="status">
                            <span className="play-question__status-badge" aria-hidden="true">
                                <Icon name="timer" size={16} />
                            </span>
                            <div className="play-question__status-text">
                                <strong>Tempo esgotado!</strong>
                                <span>
                                    Nenhuma resposta foi enviada nesta rodada. Aguardando o encerramento para
                                    revelar o gabarito e avançar.
                                </span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
