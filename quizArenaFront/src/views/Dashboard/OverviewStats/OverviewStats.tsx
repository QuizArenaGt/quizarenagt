import { useState } from 'react';
import Alert from '../../../components/ui/Alert/Alert';
import Badge, { type BadgeVariant } from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import EmptyState from '../../../components/ui/EmptyState/EmptyState';
import { LoadingState } from '../../../components/ui/Skeleton/Skeleton';
import { formatNullableDateTime, type Room } from '../../../models/room';
import {
    classifyQuestionDifficulty,
    formatRate,
    type QuestionDifficultyLevel,
    type RoomOverviewDashboardEntry,
} from '../../../models/roomReport';
import type {
    ApiRoomAggregatedQuestionPerformance,
    ApiRoomAggregatedStats,
} from '../../../services/roomStorageService';
import { useOverviewViewModel } from '../../../viewmodels/useOverviewViewModel';
import RateBar from '../components/RateBar';
import '../reports.css';
import './OverviewStats.css';

interface OverviewStatsProps {
    rooms: Room[];
    activeRoomStats?: ApiRoomAggregatedStats | null;
    isLoadingHostRooms?: boolean;
    onGoToRooms: () => void;
}

const INITIAL_HIGHLIGHT_ITEMS = 3;
const INITIAL_DISTRIBUTION_ITEMS = 5;

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
 * VIEW — Dashboard Analítico da aba Visão Geral, agrupado por sala.
 * Exibe exclusivamente salas com pelo menos uma partida finalizada (`FINISHED`),
 * consolidando indicadores gerais e desempenho acumulado das questões.
 */
export default function OverviewStats({
    rooms,
    activeRoomStats = null,
    isLoadingHostRooms = false,
    onGoToRooms,
}: OverviewStatsProps) {
    const { entries, hasData, isLoading, error, reload } = useOverviewViewModel(
        rooms,
        activeRoomStats,
        isLoadingHostRooms,
    );

    if (isLoading && !hasData) {
        return (
            <section className="overview-analytics" aria-label="Dashboard analítico por sala">
                <div className="overview-analytics__state-card">
                    <LoadingState label="Carregando desempenho consolidado das salas…" />
                </div>
            </section>
        );
    }

    if (error && !hasData) {
        return (
            <section className="overview-analytics" aria-label="Dashboard analítico por sala">
                <Alert variant="error">
                    <div className="overview-analytics__error-row">
                        <span>{error}</span>
                        <Button type="button" variant="secondary" size="sm" onClick={() => void reload()}>
                            Tentar novamente
                        </Button>
                    </div>
                </Alert>
            </section>
        );
    }

    if (!hasData) {
        return (
            <section className="overview-analytics" aria-label="Dashboard analítico por sala">
                <div className="overview-analytics__state-card">
                    <EmptyState
                        icon="trophy"
                        title="Nenhuma partida finalizada ainda"
                        description="A Visão Geral exibirá automaticamente o dashboard analítico de cada sala assim que pelo menos uma partida for finalizada."
                        action={
                            <Button type="button" variant="primary" onClick={onGoToRooms}>
                                Ir para Salas
                            </Button>
                        }
                    />
                </div>
            </section>
        );
    }

    return (
        <div className="overview-analytics" aria-label="Dashboards analíticos por sala">
            {entries.map((entry) => (
                <RoomAnalyticsSection key={entry.room.id} entry={entry} />
            ))}
        </div>
    );
}

function RoomAnalyticsSection({ entry }: { entry: RoomOverviewDashboardEntry }) {
    const { room, stats } = entry;
    const [showAllErrors, setShowAllErrors] = useState(false);
    const [showAllBest, setShowAllBest] = useState(false);
    const [showAllQuestions, setShowAllQuestions] = useState(false);

    const totalWrongAnswers =
        typeof stats.totalWrongAnswers === 'number'
            ? stats.totalWrongAnswers
            : Math.max(0, stats.totalAnswers - stats.totalCorrectAnswers);

    const lastFinishedLabel = stats.lastFinishedGameAt
        ? formatNullableDateTime(stats.lastFinishedGameAt, 'Data não registrada')
        : 'Data não registrada';

    const hardestRows = showAllErrors
        ? stats.hardestQuestions
        : stats.hardestQuestions.slice(0, INITIAL_HIGHLIGHT_ITEMS);

    const easiestRows = showAllBest
        ? stats.easiestQuestions
        : stats.easiestQuestions.slice(0, INITIAL_HIGHLIGHT_ITEMS);

    const distributionRows = showAllQuestions
        ? stats.questionPerformance
        : stats.questionPerformance.slice(0, INITIAL_DISTRIBUTION_ITEMS);

    const correctSharePercent =
        stats.totalAnswers > 0
            ? Math.round((stats.totalCorrectAnswers / stats.totalAnswers) * 100)
            : 0;
    const errorSharePercent =
        stats.totalAnswers > 0 ? Math.max(0, 100 - correctSharePercent) : 0;

    return (
        <section
            className="overview-room-dashboard"
            aria-labelledby={`overview-room-${room.id}`}
        >
            <header className="overview-room-dashboard__head">
                <div className="overview-room-dashboard__identity">
                    <div className="overview-room-dashboard__title-row">
                        <h2 id={`overview-room-${room.id}`}>{room.name}</h2>
                        {room.theme && <Badge variant="neutral">{room.theme}</Badge>}
                    </div>
                    <p className="overview-room-dashboard__subtitle">
                        Consolidado de todas as partidas finalizadas desta sala · Última em{' '}
                        {lastFinishedLabel}
                    </p>
                </div>
                <Badge variant="success">
                    {stats.finishedGamesCount === 1
                        ? '1 partida finalizada'
                        : `${stats.finishedGamesCount} partidas finalizadas`}
                </Badge>
            </header>

            {/* Indicadores gerais da sala */}
            <dl
                className="overview-room-kpis"
                aria-label={`Indicadores gerais de ${room.name}`}
            >
                <div className="overview-room-kpi">
                    <dt>Partidas finalizadas</dt>
                    <dd>{stats.finishedGamesCount}</dd>
                </div>
                <div className="overview-room-kpi">
                    <dt>Respostas registradas</dt>
                    <dd>{stats.totalAnswers}</dd>
                </div>
                <div className="overview-room-kpi">
                    <dt>Total de acertos</dt>
                    <dd className="is-success">{stats.totalCorrectAnswers}</dd>
                </div>
                <div className="overview-room-kpi">
                    <dt>Total de erros</dt>
                    <dd className="is-danger">{totalWrongAnswers}</dd>
                </div>
                <div className="overview-room-kpi">
                    <dt>Taxa geral de acerto</dt>
                    <dd>
                        {stats.averageCorrectRate !== null
                            ? formatRate(stats.averageCorrectRate)
                            : 'Sem respostas'}
                    </dd>
                </div>
                <div className="overview-room-kpi">
                    <dt>Participações acumuladas</dt>
                    <dd>{stats.totalParticipations}</dd>
                    <span className="overview-room-kpi__note">
                        Soma entre partidas (não são jogadores únicos)
                    </span>
                </div>
            </dl>

            {/* Questões com maior índice de erros & Questões com melhor desempenho */}
            <div className="report-grid">
                <section
                    className="report-card overview-question-panel"
                    aria-labelledby={`room-errors-${room.id}`}
                >
                    <div className="overview-question-panel__head">
                        <h3 id={`room-errors-${room.id}`} className="report-section__title">
                            Questões com maior índice de erros
                        </h3>
                        {stats.hardestQuestions.length > INITIAL_HIGHLIGHT_ITEMS && (
                            <button
                                type="button"
                                className="overview-stats__link"
                                onClick={() => setShowAllErrors((current) => !current)}
                            >
                                {showAllErrors
                                    ? 'Mostrar menos'
                                    : `Ver todas (${stats.hardestQuestions.length})`}
                            </button>
                        )}
                    </div>

                    {hardestRows.length === 0 ? (
                        <p className="report-empty">
                            Nenhuma questão teve erros válidos registrados nas partidas finalizadas.
                        </p>
                    ) : (
                        <ol className="report-list">
                            {hardestRows.map((row) => (
                                <QuestionHighlightItem
                                    key={row.questionKey}
                                    row={row}
                                    mode="errors"
                                />
                            ))}
                        </ol>
                    )}
                </section>

                <section
                    className="report-card overview-question-panel"
                    aria-labelledby={`room-best-${room.id}`}
                >
                    <div className="overview-question-panel__head">
                        <h3 id={`room-best-${room.id}`} className="report-section__title">
                            Questões com melhor desempenho
                        </h3>
                        {stats.easiestQuestions.length > INITIAL_HIGHLIGHT_ITEMS && (
                            <button
                                type="button"
                                className="overview-stats__link"
                                onClick={() => setShowAllBest((current) => !current)}
                            >
                                {showAllBest
                                    ? 'Mostrar menos'
                                    : `Ver todas (${stats.easiestQuestions.length})`}
                            </button>
                        )}
                    </div>

                    {easiestRows.length === 0 ? (
                        <p className="report-empty">
                            {stats.totalAnswers > 0
                                ? 'Aguardando amostra mínima de 2 respostas válidas por questão para destacar melhores desempenhos.'
                                : 'Nenhuma resposta registrada ainda nas partidas finalizadas.'}
                        </p>
                    ) : (
                        <ol className="report-list">
                            {easiestRows.map((row) => (
                                <QuestionHighlightItem
                                    key={row.questionKey}
                                    row={row}
                                    mode="best"
                                />
                            ))}
                        </ol>
                    )}
                </section>
            </div>

            {/* Distribuição de acertos vs erros e visão geral das questões */}
            <section
                className="report-card overview-distribution-card"
                aria-labelledby={`room-dist-${room.id}`}
            >
                <div className="overview-question-panel__head">
                    <h3 id={`room-dist-${room.id}`} className="report-section__title">
                        Distribuição de acertos e erros
                    </h3>
                    {stats.totalAnswers > 0 && (
                        <span className="overview-distribution__summary">
                            {stats.totalCorrectAnswers} acertos ({correctSharePercent}%) ·{' '}
                            {totalWrongAnswers} erros ({errorSharePercent}%) em {stats.totalAnswers}{' '}
                            {stats.totalAnswers === 1 ? 'resposta' : 'respostas'}
                        </span>
                    )}
                </div>

                {stats.totalAnswers === 0 ? (
                    <p className="report-empty">
                        Nenhuma resposta foi enviada nas partidas finalizadas desta sala.
                    </p>
                ) : (
                    <div
                        className="overview-distribution-bar"
                        role="img"
                        aria-label={`Distribuição geral: ${correctSharePercent}% de acertos e ${errorSharePercent}% de erros`}
                    >
                        {correctSharePercent > 0 && (
                            <div
                                className="overview-distribution-bar__correct"
                                style={{ width: `${correctSharePercent}%` }}
                            />
                        )}
                        {errorSharePercent > 0 && (
                            <div
                                className="overview-distribution-bar__wrong"
                                style={{ width: `${errorSharePercent}%` }}
                            />
                        )}
                    </div>
                )}

                {stats.questionPerformance.length > 0 && (
                    <div className="overview-distribution-list">
                        <div className="overview-question-panel__head">
                            <h4 className="overview-distribution-list__title">
                                Desempenho geral por questão ({stats.questionPerformance.length})
                            </h4>
                            {stats.questionPerformance.length > INITIAL_DISTRIBUTION_ITEMS && (
                                <button
                                    type="button"
                                    className="overview-stats__link"
                                    onClick={() => setShowAllQuestions((current) => !current)}
                                >
                                    {showAllQuestions
                                        ? 'Mostrar menos'
                                        : `Ver todas (${stats.questionPerformance.length})`}
                                </button>
                            )}
                        </div>

                        <ul className="report-list">
                            {distributionRows.map((row) => {
                                const difficulty = classifyQuestionDifficulty({
                                    answeredCount: row.answeredCount,
                                    correctRate: row.correctRate ?? 0,
                                    overallCorrectRate: row.overallCorrectRate ?? 0,
                                    participantCount: row.expectedAnswers,
                                });
                                const detailText =
                                    row.answeredCount > 0
                                        ? `${row.correctCount} acerto(s) · ${row.incorrectCount} erro(s) em ${row.answeredCount} resp. · ${row.gamesPlayedCount} ${row.gamesPlayedCount === 1 ? 'partida' : 'partidas'}`
                                        : `Sem respostas válidas · ${row.gamesPlayedCount} ${row.gamesPlayedCount === 1 ? 'partida' : 'partidas'}`;

                                return (
                                    <li key={row.questionKey} className="report-list__item">
                                        <div className="overview-distribution-item__head">
                                            <span className="report-list__text">{row.statement}</span>
                                            <Badge variant={getDifficultyVariant(difficulty.level)}>
                                                {difficulty.label}
                                            </Badge>
                                        </div>
                                        <RateBar
                                            rate={row.correctRate ?? 0}
                                            detail={detailText}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </section>
        </section>
    );
}

function QuestionHighlightItem({
    row,
    mode,
}: {
    row: ApiRoomAggregatedQuestionPerformance;
    mode: 'errors' | 'best';
}) {
    const errorRate =
        typeof row.errorRate === 'number'
            ? row.errorRate
            : row.answeredCount > 0
              ? row.incorrectCount / row.answeredCount
              : 0;
    const correctRate = row.correctRate ?? 0;

    return (
        <li className="report-list__item overview-highlight-item">
            <span className="report-list__text overview-highlight-item__statement">
                {row.statement}
            </span>
            <div className="overview-highlight-item__metrics">
                <span>
                    Total: <strong>{row.answeredCount}</strong>
                </span>
                <span>
                    Acertos: <strong>{row.correctCount}</strong>
                </span>
                <span>
                    Erros: <strong>{row.incorrectCount}</strong>
                </span>
                <span className={mode === 'errors' ? 'is-danger-rate' : 'is-success-rate'}>
                    {mode === 'errors'
                        ? `Índice de erros: ${formatRate(errorRate)}`
                        : `Taxa de acerto: ${formatRate(correctRate)}`}
                </span>
            </div>
            <div className="rate-bar" aria-hidden="true">
                <div className="rate-bar__track">
                    <span
                        className={`rate-bar__fill ${mode === 'errors' ? 'rate-bar__fill--low' : 'rate-bar__fill--good'}`}
                        style={{
                            width: `${Math.round((mode === 'errors' ? errorRate : correctRate) * 100)}%`,
                        }}
                    />
                </div>
            </div>
        </li>
    );
}
