import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import type { PlayerAnswer, RankingEntry } from '../../../models/game';
import type { Question } from '../../../models/question';
import Podium from '../components/Podium';
import RankingList from '../components/RankingList';

interface ResultStepProps {
    nickname: string;
    questions: Question[];
    answers: PlayerAnswer[];
    totalScore: number;
    correctCount: number;
    ranking: RankingEntry[];
    playerPosition: number | null;
    isDemo: boolean;
    onPlayAgain: () => void;
    onLeave: () => void;
}

export default function ResultStep({
    nickname,
    questions,
    answers,
    totalScore,
    correctCount,
    ranking,
    playerPosition,
    isDemo,
    onPlayAgain,
    onLeave,
}: ResultStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();
    const isOnPodium = playerPosition !== null && playerPosition <= 3;

    return (
        <section className="play-card play-card--wide" aria-labelledby="play-result-title">
            <div className="play-result__header">
                <h1 id="play-result-title" ref={titleRef} tabIndex={-1} className="play-card__title">
                    {isOnPodium ? `Parabéns, ${nickname}!` : `Fim de jogo, ${nickname}!`}
                </h1>
                <p className="play-card__text">
                    {playerPosition !== null && (
                        <>
                            Você terminou em <strong>{playerPosition}º lugar</strong> com{' '}
                        </>
                    )}
                    <strong>{totalScore} pontos</strong> e acertou <strong>{correctCount}</strong> de{' '}
                    <strong>{questions.length}</strong> perguntas.
                </p>
            </div>

            <Podium ranking={ranking} />

            <h2 className="play-result__subtitle">Classificação</h2>
            <RankingList entries={ranking} />
            {isDemo && (
                <p className="play-result__note">Os demais jogadores são simulados nesta demonstração.</p>
            )}

            <h2 className="play-result__subtitle">Suas respostas</h2>
            <ol className="play-result__list">
                {questions.map((question) => {
                    const answer = answers.find((item) => item.questionId === question.id);
                    const isCorrect = answer?.isCorrect ?? false;
                    return (
                        <li key={question.id} className={`play-result__item${isCorrect ? ' is-correct' : ''}`}>
                            <span className="play-result__mark">
                                <Icon name={isCorrect ? 'check' : 'close'} size={16} />
                                <span className="sr-only">{isCorrect ? 'Acertou' : 'Errou'}</span>
                            </span>
                            <span className="play-result__statement">{question.statement}</span>
                            <span className="play-result__points">+{answer?.points ?? 0}</span>
                        </li>
                    );
                })}
            </ol>

            <div className="play-result__actions">
                <Button size="lg" onClick={onPlayAgain}>
                    Jogar novamente
                </Button>
                <Button size="lg" variant="secondary" onClick={onLeave}>
                    Voltar ao início
                </Button>
            </div>
        </section>
    );
}
