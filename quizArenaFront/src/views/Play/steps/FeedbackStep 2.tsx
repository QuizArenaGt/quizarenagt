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
    const timedOut = answer.selectedOptionId === null;

    const status = answer.isCorrect ? 'correct' : timedOut ? 'timeout' : 'wrong';
    const title = {
        correct: 'Resposta certa!',
        wrong: 'Não foi dessa vez',
        timeout: 'Tempo esgotado!',
    }[status];

    const formattedPoints =
        answer.points >= 0 ? `+${answer.points} pontos` : `${answer.points} pontos`;

    return (
        <section
            className={`play-card play-card--center play-feedback play-feedback--${status}`}
            aria-labelledby="play-feedback-title"
        >
            <span className="play-feedback__icon" aria-hidden="true">
                <Icon name={answer.isCorrect ? 'check' : 'close'} size={40} />
            </span>

            <h1 id="play-feedback-title" ref={titleRef} tabIndex={-1} className="play-card__title">
                {title}
            </h1>

            <p className="play-feedback__points">{formattedPoints}</p>

            {!answer.isCorrect && correctOption && (
                <p className="play-feedback__answer">
                    Resposta correta:{' '}
                    <strong>
                        {CHOICE_LETTERS[correctIndex]} — {correctOption.text}
                    </strong>
                </p>
            )}

            <div className="play-feedback__ranking">
                <p className="play-feedback__position">
                    {playerPosition !== null && (
                        <>
                            Você está em <strong>{playerPosition}º lugar</strong> ·{' '}
                        </>
                    )}
                    {totalScore} pontos
                </p>
                <RankingList entries={ranking} limit={PARTIAL_RANKING_SIZE} />
            </div>

            <p className="play-lobby__waiting" style={{ marginTop: '16px' }}>
                Aguardando o anfitrião avançar a rodada
                <span className="play-lobby__dots" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                </span>
            </p>
        </section>
    );
}
