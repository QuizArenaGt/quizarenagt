import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
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
    isGameCancelled?: boolean;
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
    isGameCancelled = false,
    onPlayAgain,
    onLeave,
}: ResultStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();
    const isOnPodium = !isGameCancelled && playerPosition !== null && playerPosition <= 3;

    const wrongSubmittedCount = answers.filter(
        (ans) => !ans.isCorrect && ans.selectedOptionId !== null,
    ).length;
    const unansweredCount =
        questions.length > 0
            ? Math.max(0, questions.length - correctCount - wrongSubmittedCount)
            : answers.filter((ans) => ans.selectedOptionId === null).length;

    return (
        <section className="play-card play-card--wide play-result" aria-labelledby="play-result-title">
            <div className="play-result__header">
                {!isGameCancelled && (
                    <Badge variant={isOnPodium ? 'warning' : 'primary'} className="play-result__badge">
                        <Icon name="trophy" size={14} />
                        {isOnPodium && playerPosition !== null
                            ? `Pódio · ${playerPosition}º lugar`
                            : 'Partida concluída'}
                    </Badge>
                )}

                <h1 id="play-result-title" ref={titleRef} tabIndex={-1} className="play-card__title">
                    {isGameCancelled
                        ? `Partida cancelada, ${nickname}`
                        : isOnPodium
                          ? `Parabéns, ${nickname}!`
                          : `Fim de jogo, ${nickname}!`}
                </h1>

                {isGameCancelled ? (
                    <Alert variant="warning" className="play-result__cancel-alert">
                        A partida foi encerrada automaticamente porque restaram menos de 2 jogadores ativos.
                        Não houve vencedor oficial.
                    </Alert>
                ) : (
                    <p className="play-card__text">
                        {playerPosition !== null ? (
                            <>
                                Você finalizou em <strong>{playerPosition}º lugar</strong> com{' '}
                                <strong>{totalScore} pontos</strong>
                            </>
                        ) : (
                            <>
                                Você acumulou <strong>{totalScore} pontos</strong>
                            </>
                        )}
                        {questions.length > 0 && (
                            <>
                                {' '}
                                e acertou <strong>{correctCount}</strong> de{' '}
                                <strong>{questions.length}</strong>{' '}
                                {questions.length === 1 ? 'pergunta' : 'perguntas'}
                            </>
                        )}
                        .
                    </p>
                )}
            </div>

            <dl className="play-result__stats" aria-label="Seu desempenho na partida">
                <div className="play-result__stat">
                    <dt>Pontuação</dt>
                    <dd className={totalScore < 0 ? 'is-negative' : 'is-primary'}>
                        {totalScore} pts
                    </dd>
                </div>
                <div className="play-result__stat">
                    <dt>Acertos</dt>
                    <dd className="is-good">{correctCount}</dd>
                </div>
                <div className="play-result__stat">
                    <dt>Erros</dt>
                    <dd className="is-bad">{wrongSubmittedCount}</dd>
                </div>
                <div className="play-result__stat">
                    <dt>Sem resposta</dt>
                    <dd className="is-muted">{unansweredCount}</dd>
                </div>
            </dl>

            {!isGameCancelled && ranking.length > 0 && (
                <>
                    <Podium ranking={ranking} />

                    <h2 className="play-result__subtitle">Classificação Final</h2>
                    <RankingList entries={ranking} />
                </>
            )}

            {questions.length > 0 && (
                <>
                    <h2 className="play-result__subtitle">Resumo das suas respostas</h2>
                    <ol className="play-result__list">
                        {questions.map((question, index) => {
                            const answer = answers.find((item) => item.questionId === question.id);
                            const isCorrect = answer?.isCorrect ?? false;
                            const isUnanswered = !answer || answer.selectedOptionId === null;
                            const itemStatus = isCorrect ? 'correct' : isUnanswered ? 'timeout' : 'wrong';
                            const statusLabel = isCorrect
                                ? 'Acertou'
                                : isUnanswered
                                  ? 'Sem resposta'
                                  : 'Errou';
                            const pts = answer?.points ?? 0;

                            return (
                                <li
                                    key={question.id}
                                    className={`play-result__item play-result__item--${itemStatus}${isCorrect ? ' is-correct' : ''}`}
                                >
                                    <span className="play-result__mark" aria-hidden="true">
                                        <Icon
                                            name={isCorrect ? 'check' : isUnanswered ? 'timer' : 'close'}
                                            size={15}
                                        />
                                    </span>
                                    <div className="play-result__item-body">
                                        <span className="play-result__statement">
                                            <strong>#{index + 1}</strong> {question.statement}
                                        </span>
                                        <span className="play-result__item-status">{statusLabel}</span>
                                    </div>
                                    <span className="play-result__points">
                                        {pts > 0 ? `+${pts}` : `${pts}`} pts
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}

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
