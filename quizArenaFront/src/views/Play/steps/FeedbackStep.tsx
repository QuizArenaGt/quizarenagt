import Badge from '../../../components/ui/Badge/Badge';
import Icon from '../../../components/ui/Icon/Icon';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import type { PlayerAnswer, RankingEntry } from '../../../models/game';
import { CHOICE_LETTERS, type Question } from '../../../models/question';
import RankingList from '../components/RankingList';

interface FeedbackStepProps {
    question: Question;
    answer: PlayerAnswer;
    totalScore: number;
    ranking: RankingEntry[];
    playerPosition: number | null;
}

const PARTIAL_RANKING_SIZE = 5;

export default function FeedbackStep({
    question,
    answer,
    totalScore,
    ranking,
    playerPosition,
}: FeedbackStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();

    const correctIndex = question.options.findIndex((option) => option.isCorrect);
    const correctOption = question.options[correctIndex];
    const selectedIndex = answer.selectedOptionId
        ? question.options.findIndex((option) => option.id === answer.selectedOptionId)
        : -1;
    const selectedOption = selectedIndex >= 0 ? question.options[selectedIndex] : undefined;
    const timedOut = answer.selectedOptionId === null;

    const status = answer.isCorrect ? 'correct' : timedOut ? 'timeout' : 'wrong';
    const title = {
        correct: 'Resposta certa!',
        wrong: 'Não foi dessa vez',
        timeout: 'Tempo esgotado!',
    }[status];

    const subtitle = {
        correct: 'Você acertou e somou pontos nesta rodada.',
        wrong: 'Confira abaixo sua alternativa e a resposta correta.',
        timeout: 'Nenhuma resposta foi enviada antes do fim do tempo.',
    }[status];

    const formattedPoints =
        answer.points > 0
            ? `+${answer.points} pts nesta rodada`
            : answer.points < 0
              ? `${answer.points} pts nesta rodada`
              : '0 pts nesta rodada';

    return (
        <section
            className={`play-card play-card--wide play-card--center play-feedback play-feedback--${status}`}
            aria-labelledby="play-feedback-title"
        >
            <span className="play-feedback__icon" aria-hidden="true">
                <Icon name={answer.isCorrect ? 'check' : timedOut ? 'timer' : 'close'} size={36} />
            </span>

            <h1 id="play-feedback-title" ref={titleRef} tabIndex={-1} className="play-card__title">
                {title}
            </h1>

            <p className="play-card__text">{subtitle}</p>

            <div className="play-feedback__score-row">
                <span className={`play-feedback__points-pill is-${status}`}>{formattedPoints}</span>
                <Badge variant="primary">Total: {totalScore} pts</Badge>
            </div>

            {!answer.isCorrect && selectedOption && (
                <p className="play-feedback__chosen">
                    Sua resposta:{' '}
                    <strong>
                        {CHOICE_LETTERS[selectedIndex]} — {selectedOption.text}
                    </strong>
                </p>
            )}

            {correctOption && (
                <p className="play-feedback__answer">
                    <Icon name="check" size={16} />
                    <span>
                        Gabarito:{' '}
                        <strong>
                            {CHOICE_LETTERS[correctIndex]} — {correctOption.text}
                        </strong>
                    </span>
                </p>
            )}

            <div className="play-feedback__ranking">
                <div className="play-feedback__ranking-head">
                    <h2 className="play-feedback__ranking-title">Placar parcial</h2>
                    <span className="play-feedback__position">
                        {playerPosition !== null && (
                            <>
                                <strong>{playerPosition}º lugar</strong> ·{' '}
                            </>
                        )}
                        {totalScore} pts
                    </span>
                </div>
                <RankingList entries={ranking} limit={PARTIAL_RANKING_SIZE} />
            </div>

            <div className="play-lobby__waiting-banner play-feedback__next" role="status" aria-live="polite">
                <span className="play-lobby__pulse" aria-hidden="true" />
                <p className="play-lobby__waiting">
                    Rodada encerrada · Aguardando a próxima pergunta
                    <span className="play-lobby__dots" aria-hidden="true">
                        <span>.</span>
                        <span>.</span>
                        <span>.</span>
                    </span>
                </p>
            </div>
        </section>
    );
}
