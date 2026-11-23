import Alert from '../../../components/ui/Alert/Alert';
import Badge, { type BadgeVariant } from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import EmptyState from '../../../components/ui/EmptyState/EmptyState';
import Icon from '../../../components/ui/Icon/Icon';
import Modal from '../../../components/ui/Modal/Modal';
import { PlayerAvatar } from '../../../components/ui/PlayerAvatar/PlayerAvatar';
import { LoadingState } from '../../../components/ui/Skeleton/Skeleton';
import { formatNullableDateTime, type Room } from '../../../models/room';
import {
    classifyQuestionDifficulty,
    formatGameDuration,
    formatGameStatusLabel,
    formatRate,
    formatShortGameMode,
    type QuestionDifficultyLevel,
    type QuestionReportRow,
    type RoomReport,
    type StudentReportRow,
} from '../../../models/roomReport';
import type {
    ApiGameDetailedResults,
    ApiGameStatus,
} from '../../../services/roomStorageService';
import '../reports.css';

interface RoomReportModalProps {
    view: {
        room: Room;
        report: RoomReport | null;
        gameDetails?: ApiGameDetailedResults | null;
        isLoading?: boolean;
        error?: string | null;
    } | null;
    onClose: () => void;
}

function getGameStatusVariant(status: ApiGameStatus): BadgeVariant {
    switch (status) {
        case 'IN_PROGRESS':
            return 'success';
        case 'WAITING':
            return 'warning';
        case 'CANCELLED':
            return 'danger';
        case 'FINISHED':
            return 'neutral';
    }
}

function getDifficultyVariant(level: QuestionDifficultyLevel): BadgeVariant {
    switch (level) {
        case 'easy':
            return 'success';
        case 'medium':
            return 'warning';
        case 'hard':
            return 'danger';
        case 'no-data':
            return 'neutral';
    }
}

/**
 * VIEW — relatório de uma sala ou partida: metadados, resumo de aproveitamento,
 * ranking dos participantes, destaques e análise detalhada por questão.
 */
export default function RoomReportModal({ view, onClose }: RoomReportModalProps) {
    const details = view?.gameDetails ?? null;

    return (
        <Modal
            isOpen={view !== null}
            onClose={onClose}
            size="lg"
            title={view ? `Relatório — ${view.room.name}` : ''}
            description={
                view?.isLoading
                    ? 'Carregando dados da partida…'
                    : view?.error
                      ? undefined
                      : details
                        ? 'Resumo de desempenho, classificação e respostas da partida.'
                        : undefined
            }
        >
            <div className="report-modal-root">
                {view?.isLoading ? (
                    <LoadingState label="Carregando resultados da partida…" />
                ) : view?.error ? (
                    <Alert variant="error">{view.error}</Alert>
                ) : (
                    <>
                        {details && <GameMetadataBanner details={details} />}

                        {details?.status === 'CANCELLED' && (
                            <Alert variant="warning" className="report-status-alert">
                                Partida cancelada antes do término por insuficiência de jogadores. Os números
                                abaixo refletem os registros parciais salvos até o encerramento.
                            </Alert>
                        )}

                        {details?.status === 'IN_PROGRESS' && (
                            <Alert variant="info" className="report-status-alert">
                                Partida ainda em andamento. As métricas parciais serão atualizadas até a
                                conclusão da última rodada.
                            </Alert>
                        )}

                        {view?.report ? (
                            <ReportContent report={view.report} />
                        ) : (
                            <EmptyState
                                icon="trophy"
                                title="Nenhum participante registrado nesta partida"
                                description="Quando os jogadores participarem e concluírem rodadas desta partida, o ranking e as métricas aparecerão aqui."
                            />
                        )}
                    </>
                )}

                <div className="report-actions">
                    <Button type="button" onClick={onClose}>
                        Fechar
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function GameMetadataBanner({ details }: { details: ApiGameDetailedResults }) {
    return (
        <dl className="report-meta" aria-label="Dados da partida">
            <div className="report-meta__item">
                <dt>Status</dt>
                <dd>
                    <Badge variant={getGameStatusVariant(details.status)}>
                        {formatGameStatusLabel(details.status)}
                    </Badge>
                </dd>
            </div>
            <div className="report-meta__item">
                <dt>Modo</dt>
                <dd>{formatShortGameMode(details.gameMode)}</dd>
            </div>
            <div className="report-meta__item">
                <dt>Início</dt>
                <dd>{formatNullableDateTime(details.startedAt ?? details.createdAt, 'Não iniciada')}</dd>
            </div>
            <div className="report-meta__item">
                <dt>Duração</dt>
                <dd>{formatGameDuration(details.durationMs, details.status)}</dd>
            </div>
            <div className="report-meta__item report-meta__item--winner">
                <dt>Vencedor</dt>
                <dd>
                    {details.winner ? (
                        <span className="report-meta__winner">
                            <Icon name="trophy" size={14} />
                            <PlayerAvatar
                                avatarId={details.winner.avatarId}
                                nickname={details.winner.nickname}
                                size="xs"
                                decorative
                            />
                            <span>
                                {details.winner.nickname} ({details.winner.score} pts)
                            </span>
                        </span>
                    ) : details.status === 'FINISHED' ? (
                        'Sem vencedor'
                    ) : (
                        '—'
                    )}
                </dd>
            </div>
        </dl>
    );
}

function ReportContent({ report }: { report: RoomReport }) {
    const totalAnswered =
        report.totalAnswered ?? report.questionRows.reduce((sum, q) => sum + q.answeredCount, 0);
    const totalCorrect =
        report.totalCorrect ?? report.questionRows.reduce((sum, q) => sum + q.correctCount, 0);
    const expectedAnswers =
        report.expectedAnswers ?? report.participantCount * report.questionRows.length;
    const totalUnanswered =
        report.totalUnanswered ?? Math.max(0, expectedAnswers - totalAnswered);
    const overallCorrectRate =
        report.overallCorrectRate ??
        (expectedAnswers > 0 ? totalCorrect / expectedAnswers : report.averageCorrectRate);
    const hasTies = report.ranking.some((row) => row.isTied);

    return (
        <div className="report">
            {/* Resumo numérico da partida */}
            <section aria-labelledby="report-summary-title">
                <h3 id="report-summary-title" className="report-section__title">
                    Resumo da partida
                </h3>
                <dl className="report-kpi-strip">
                    <div className="report-kpi">
                        <dt className="report-kpi__label">Participantes</dt>
                        <dd className="report-kpi__value">{report.participantCount}</dd>
                        <dd className="report-kpi__caption">
                            {report.participantCount === 1 ? 'jogador ativo' : 'jogadores ativos'}
                        </dd>
                    </div>
                    <div className="report-kpi">
                        <dt className="report-kpi__label">Perguntas</dt>
                        <dd className="report-kpi__value">{report.questionCount}</dd>
                        <dd className="report-kpi__caption">
                            {expectedAnswers > 0
                                ? `${expectedAnswers} respostas esperadas`
                                : 'Sem rodadas registradas'}
                        </dd>
                    </div>
                    <div className="report-kpi">
                        <dt className="report-kpi__label">Aproveitamento geral</dt>
                        <dd className="report-kpi__value">{formatRate(overallCorrectRate)}</dd>
                        <dd className="report-kpi__caption">
                            {expectedAnswers > 0
                                ? `${totalCorrect} de ${expectedAnswers} possíveis`
                                : 'Sem base'}
                        </dd>
                    </div>
                    <div className="report-kpi">
                        <dt className="report-kpi__label">Acerto nas respondidas</dt>
                        <dd className="report-kpi__value">{formatRate(report.averageCorrectRate)}</dd>
                        <dd className="report-kpi__caption">
                            {totalAnswered > 0
                                ? `${totalCorrect} de ${totalAnswered} envios${
                                      totalUnanswered > 0 ? ` · ${totalUnanswered} sem resp.` : ''
                                  }`
                                : totalUnanswered > 0
                                  ? `${totalUnanswered} sem resposta`
                                  : 'Nenhuma resposta'}
                        </dd>
                    </div>
                </dl>
            </section>

            {/* Ranking dos participantes */}
            <section aria-labelledby="report-ranking-title">
                <div className="report-section-head">
                    <h3 id="report-ranking-title" className="report-section__title">
                        Ranking dos participantes
                    </h3>
                    {hasTies && (
                        <span className="report-tie-note">
                            Empates na pontuação seguem a ordem de entrada
                        </span>
                    )}
                </div>

                {/* Tabela desktop/tablet */}
                <div className="report-table-wrapper">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th scope="col">Pos.</th>
                                <th scope="col">Participante</th>
                                <th scope="col">Pontuação</th>
                                <th scope="col">Acertos</th>
                                <th scope="col">Erros</th>
                                <th scope="col">Sem resp.</th>
                                <th scope="col">Aproveit.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.ranking.map((row) => {
                                const incorrectCount = row.incorrectCount ?? row.wrongCount;
                                const unansweredCount = row.unansweredCount ?? 0;
                                const accuracy =
                                    row.accuracyRate ??
                                    (report.questionCount > 0 ? row.correctCount / report.questionCount : 0);

                                return (
                                    <tr key={`${row.position}-${row.nickname}`}>
                                        <td>
                                            <span
                                                className={`report-position report-position--${Math.min(row.position, 4)}`}
                                            >
                                                {row.position}º
                                            </span>
                                        </td>
                                        <td>
                                            <StudentName row={row} />
                                        </td>
                                        <td>
                                            <span
                                                className={`report-score ${row.score < 0 ? 'is-negative' : ''}`}
                                            >
                                                {row.score} pts
                                            </span>
                                        </td>
                                        <td className="report-num report-num--good">{row.correctCount}</td>
                                        <td className="report-num report-num--bad">{incorrectCount}</td>
                                        <td className="report-num report-num--muted">{unansweredCount}</td>
                                        <td className="report-num">{formatRate(accuracy)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Cartões compactos para telas estreitas (< 640px) */}
                <ol className="report-ranking-cards" aria-label="Ranking dos participantes">
                    {report.ranking.map((row) => {
                        const incorrectCount = row.incorrectCount ?? row.wrongCount;
                        const unansweredCount = row.unansweredCount ?? 0;
                        const accuracy =
                            row.accuracyRate ??
                            (report.questionCount > 0 ? row.correctCount / report.questionCount : 0);

                        return (
                            <li key={`mobile-${row.position}-${row.nickname}`} className="report-ranking-card">
                                <div className="report-ranking-card__top">
                                    <div className="report-ranking-card__identity">
                                        <span
                                            className={`report-position report-position--${Math.min(row.position, 4)}`}
                                        >
                                            {row.position}º
                                        </span>
                                        <span className="report-ranking-card__name">
                                            <StudentName row={row} />
                                        </span>
                                    </div>
                                    <span className={`report-score ${row.score < 0 ? 'is-negative' : ''}`}>
                                        {row.score} pts
                                    </span>
                                </div>
                                <div className="report-ranking-card__stats">
                                    <span className="report-stat-pill report-stat-pill--good">
                                        Acertos: <strong>{row.correctCount}</strong>
                                    </span>
                                    <span className="report-stat-pill report-stat-pill--bad">
                                        Erros: <strong>{incorrectCount}</strong>
                                    </span>
                                    <span className="report-stat-pill">
                                        Sem resp.: <strong>{unansweredCount}</strong>
                                    </span>
                                    <span className="report-stat-pill">
                                        Aproveit.: <strong>{formatRate(accuracy)}</strong>
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* Análise detalhada de cada questão */}
            {report.questionRows.length > 0 && (
                <section aria-labelledby="report-questions-title">
                    <div className="report-section-head">
                        <h3 id="report-questions-title" className="report-section__title">
                            Desempenho por questão ({report.questionRows.length})
                        </h3>
                        <div className="report-legend" aria-hidden="true">
                            <span className="report-legend__item">
                                <span className="report-legend__dot report-legend__dot--good" />
                                Acertos
                            </span>
                            <span className="report-legend__item">
                                <span className="report-legend__dot report-legend__dot--bad" />
                                Erros
                            </span>
                            <span className="report-legend__item">
                                <span className="report-legend__dot report-legend__dot--muted" />
                                Sem resposta
                            </span>
                        </div>
                    </div>

                    <ol className="report-questions-list">
                        {report.questionRows.map((question, index) => (
                            <QuestionAnalysisItem
                                key={question.questionId}
                                row={question}
                                index={index}
                                fallbackParticipantCount={report.participantCount}
                            />
                        ))}
                    </ol>
                </section>
            )}

            {/* Destaques rápidos (erros reais e desempenho individual) */}
            {report.questionRows.length > 0 && (
                <div className="report-grid">
                    <section className="report-card" aria-labelledby="report-worst-questions">
                        <h3 id="report-worst-questions" className="report-section__title">
                            Questões com mais erros
                        </h3>
                        {report.mostMissedQuestions.length === 0 ? (
                            <p className="report-card-empty">
                                Nenhuma resposta incorreta registrada nesta partida.
                                {totalUnanswered > 0 && (
                                    <>
                                        {' '}
                                        Houve{' '}
                                        <strong>
                                            {totalUnanswered}{' '}
                                            {totalUnanswered === 1
                                                ? 'ocorrência sem resposta'
                                                : 'ocorrências sem resposta'}
                                        </strong>{' '}
                                        no tempo limite.
                                    </>
                                )}
                            </p>
                        ) : (
                            <ol className="report-list">
                                {report.mostMissedQuestions.map((row) => {
                                    const incorrect =
                                        row.incorrectCount ??
                                        Math.max(0, row.answeredCount - row.correctCount);
                                    const unanswered =
                                        row.unansweredCount ??
                                        Math.max(0, report.participantCount - row.answeredCount);

                                    return (
                                        <li key={row.questionId} className="report-list__item">
                                            <span className="report-list__text">{row.statement}</span>
                                            <span className="report-list__sub">
                                                <strong className="report-num--bad">
                                                    {incorrect} {incorrect === 1 ? 'erro' : 'erros'}
                                                </strong>
                                                {unanswered > 0 && ` · ${unanswered} sem resposta`}
                                                {` · ${formatRate(row.correctRate)} de acerto nas respondidas`}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </section>

                    <section className="report-card" aria-labelledby="report-player-highlights">
                        <h3 id="report-player-highlights" className="report-section__title">
                            Destaques individuais
                        </h3>

                        <div className="report-highlights-group">
                            <h4 className="report-highlights-subtitle">Mais acertos</h4>
                            {report.studentsWithMostCorrect.length === 0 ? (
                                <p className="report-card-empty">Nenhum acerto registrado.</p>
                            ) : (
                                <ol className="report-list">
                                    {report.studentsWithMostCorrect.map((row) => (
                                        <li
                                            key={`best-${row.position}-${row.nickname}`}
                                            className="report-list__item report-list__item--row"
                                        >
                                            <span className="report-list__text">
                                                <StudentName row={row} />
                                            </span>
                                            <span className="report-list__metric">
                                                {row.correctCount}{' '}
                                                {row.correctCount === 1 ? 'acerto' : 'acertos'}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>

                        <div className="report-highlights-group report-highlights-group--divider">
                            <h4 className="report-highlights-subtitle">Mais erros enviados</h4>
                            {report.studentsWithMostWrong.length === 0 ? (
                                <p className="report-card-empty">
                                    Nenhum participante enviou respostas erradas.
                                </p>
                            ) : (
                                <ol className="report-list">
                                    {report.studentsWithMostWrong.map((row) => {
                                        const incorrect = row.incorrectCount ?? row.wrongCount;
                                        return (
                                            <li
                                                key={`wrong-${row.position}-${row.nickname}`}
                                                className="report-list__item report-list__item--row"
                                            >
                                                <span className="report-list__text">
                                                    <StudentName row={row} />
                                                </span>
                                                <span className="report-list__metric report-num--bad">
                                                    {incorrect} {incorrect === 1 ? 'erro' : 'erros'}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {totalUnanswered > 0 && (
                <p className="report-note">
                    As métricas separam <strong>erros</strong> (alternativa incorreta enviada) de{' '}
                    <strong>sem resposta</strong> (tempo esgotado ou saída). A pontuação oficial continua
                    calculada pelo servidor conforme o modo da sala.
                </p>
            )}

            {report.participantCount > report.realStudentCount && (
                <p className="report-note">
                    Alunos marcados como "simulado" completam a turma nesta demonstração; em partidas reais,
                    aparecem apenas os participantes da sala.
                </p>
            )}
        </div>
    );
}

function StudentName({ row }: { row: StudentReportRow }) {
    return (
        <span className="report-player-name">
            <PlayerAvatar
                avatarId={row.avatarId}
                nickname={row.nickname}
                size="xs"
                decorative
            />
            <span>{row.nickname}</span>
            {row.isTied && <span className="report-tag-tie">Empate</span>}
            {row.isSimulated && <span className="report-simulated">simulado</span>}
        </span>
    );
}

function QuestionAnalysisItem({
    row,
    index,
    fallbackParticipantCount,
}: {
    row: QuestionReportRow;
    index: number;
    fallbackParticipantCount: number;
}) {
    const participantCount = row.participantCount ?? fallbackParticipantCount;
    const incorrectCount = row.incorrectCount ?? Math.max(0, row.answeredCount - row.correctCount);
    const unansweredCount =
        row.unansweredCount ?? Math.max(0, participantCount - row.answeredCount);
    const totalSlots = Math.max(participantCount, row.answeredCount, 1);
    const correctWidth = (row.correctCount / totalSlots) * 100;
    const incorrectWidth = (incorrectCount / totalSlots) * 100;
    const unansweredWidth = (unansweredCount / totalSlots) * 100;
    const overallRate =
        row.overallCorrectRate ??
        (participantCount > 0 ? row.correctCount / participantCount : row.correctRate);
    const difficulty = classifyQuestionDifficulty({
        answeredCount: row.answeredCount,
        correctRate: row.correctRate,
        overallCorrectRate: overallRate,
        participantCount,
    });

    return (
        <li className="report-question-item">
            <div className="report-question-item__head">
                <div className="report-question-item__badges">
                    <span className="report-question-item__num">
                        Questão {row.roundNumber ?? index + 1}
                    </span>
                    <Badge variant={getDifficultyVariant(difficulty.level)}>{difficulty.label}</Badge>
                    {row.roundStatus === 'OPEN' && <Badge variant="info">Em aberto</Badge>}
                </div>
                <span className="report-question-item__rate">
                    {participantCount > 0
                        ? `${formatRate(overallRate)} dos participantes`
                        : `${formatRate(row.correctRate)} de acerto`}
                </span>
            </div>

            <p className="report-question-item__statement">{row.statement}</p>

            <div className="report-dist-bar" aria-hidden="true">
                {correctWidth > 0 && (
                    <span
                        className="report-dist-bar__segment report-dist-bar__segment--good"
                        style={{ width: `${correctWidth}%` }}
                    />
                )}
                {incorrectWidth > 0 && (
                    <span
                        className="report-dist-bar__segment report-dist-bar__segment--bad"
                        style={{ width: `${incorrectWidth}%` }}
                    />
                )}
                {unansweredWidth > 0 && (
                    <span
                        className="report-dist-bar__segment report-dist-bar__segment--muted"
                        style={{ width: `${unansweredWidth}%` }}
                    />
                )}
            </div>

            <div className="report-question-item__metrics">
                <div className="report-question-item__counts">
                    <span className="report-stat-pill report-stat-pill--good">
                        Acertos: <strong>{row.correctCount}</strong>
                    </span>
                    <span className="report-stat-pill report-stat-pill--bad">
                        Erros: <strong>{incorrectCount}</strong>
                    </span>
                    <span className="report-stat-pill">
                        Sem resposta: <strong>{unansweredCount}</strong>
                    </span>
                </div>
                <span className="report-question-item__answered-rate">
                    {row.answeredCount > 0
                        ? `Nas respondidas: ${formatRate(row.correctRate)} (${row.correctCount}/${row.answeredCount})`
                        : 'Nenhuma resposta enviada'}
                </span>
            </div>
        </li>
    );
}
