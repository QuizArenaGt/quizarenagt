import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Alert from '../../components/ui/Alert/Alert';
import Badge from '../../components/ui/Badge/Badge';
import Button from '../../components/ui/Button/Button';
import Icon from '../../components/ui/Icon/Icon';
import Logo from '../../components/ui/Logo/Logo';
import { PlayerAvatar } from '../../components/ui/PlayerAvatar/PlayerAvatar';
import { LoadingState } from '../../components/ui/Skeleton/Skeleton';
import { toProjectionRankingEntries } from '../../models/projection';
import {
    CHOICE_LETTERS,
    QUESTION_TYPE_LABEL,
    getQuestionOptionTone,
} from '../../models/question';
import {
    GAME_MODE_LABEL,
    formatRoomCode,
    getClipboardRoomCode,
} from '../../models/room';
import { useProjectionViewModel } from '../../viewmodels/useProjectionViewModel';
import Podium from '../Play/components/Podium';
import RankingList from '../Play/components/RankingList';
import '../Play/PlayView.css';
import './ProjectionView.css';

const LOW_TIME_SECONDS = 5;
const WARN_TIME_SECONDS = 10;

export default function ProjectionView() {
    const { code } = useParams<{ code: string }>();
    const vm = useProjectionViewModel(code);
    const [isFullscreen, setIsFullscreen] = useState(
        () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
    );
    const supportsFullscreen =
        typeof document !== 'undefined' &&
        typeof document.documentElement?.requestFullscreen === 'function';

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    async function handleToggleFullscreen() {
        if (typeof document === 'undefined') return;
        try {
            if (document.fullscreenElement) {
                if (typeof document.exitFullscreen === 'function') {
                    await document.exitFullscreen();
                }
            } else if (typeof document.documentElement?.requestFullscreen === 'function') {
                await document.documentElement.requestFullscreen();
            }
        } catch {
            // Navegador pode bloquear fullscreen fora de gesto permitido; a tela segue utilizável.
        }
    }

    const { state, phase, remainingSeconds, eligiblePlayerCount } = vm;
    const joinAddress =
        typeof window !== 'undefined' ? `${window.location.host}/jogar` : '/jogar';

    const activeRound = state?.activeRound ?? null;
    const closedRound = state?.closedRound ?? null;
    const isTimeSynced = remainingSeconds !== null;
    const timeLimit = activeRound?.timeLimit ?? state?.timeLimit ?? 0;
    const timeRatio =
        activeRound && timeLimit > 0
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
    const timerStateClass = isExpired
        ? 'is-expired'
        : isLowTime
          ? 'is-low'
          : isWarnTime
            ? 'is-warn'
            : '';

    const roundTotalSuffix =
        state && state.totalQuestions > 0 ? ` de ${state.totalQuestions}` : '';
    const responsePercent =
        eligiblePlayerCount > 0 && state
            ? Math.min(100, Math.round((state.answeredPlayerIds.length / eligiblePlayerCount) * 100))
            : 0;

    return (
        <div className="projection">
            <header className="projection__topbar">
                <div className="projection__topbar-left">
                    <span className="projection__brand">
                        <Logo variant="dark" />
                    </span>

                    {state && (
                        <span className="projection__chip projection__chip--code">
                            {state.roomName} · {formatRoomCode(state.roomCode)}
                        </span>
                    )}
                </div>

                <div className="projection__topbar-right">
                    {vm.socketStatus === 'reconnecting' && !vm.socketError && state && !state.archived && (
                        <span className="projection__chip projection__chip--warn" role="status">
                            Reconectando…
                        </span>
                    )}

                    {vm.socketError && (
                        <span className="projection__chip projection__chip--error" role="alert">
                            {vm.socketError}
                        </span>
                    )}

                    {supportsFullscreen && (
                        <button
                            type="button"
                            className="projection__fullscreen-btn"
                            onClick={() => void handleToggleFullscreen()}
                            aria-pressed={isFullscreen}
                        >
                            <Icon name="rooms" size={14} />
                            <span>{isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</span>
                        </button>
                    )}
                </div>
            </header>

            <main className="projection__stage">
                {vm.isLoading && (
                    <section className="projection-card projection-card--narrow">
                        <LoadingState label="Carregando projeção da sala…" />
                    </section>
                )}

                {!vm.isLoading && vm.loadError && (
                    <section className="projection-card projection-card--narrow" role="alert">
                        <div className="projection-card__eyebrow">
                            <Badge variant="danger">Projeção indisponível</Badge>
                        </div>
                        <h1 className="projection-card__title">Não foi possível abrir a projeção</h1>
                        <div style={{ marginTop: 'var(--space-4)' }}>
                            <Alert variant="error">{vm.loadError.message}</Alert>
                        </div>
                        <div className="projection-card__actions">
                            {vm.loadError.kind === 'network' && (
                                <Button type="button" variant="primary" onClick={vm.retryLoad}>
                                    Tentar novamente
                                </Button>
                            )}
                            {vm.loadError.kind === 'auth' ? (
                                <Button to="/login" variant="primary">
                                    Fazer login
                                </Button>
                            ) : (
                                <Button to="/dashboard" variant="secondary">
                                    Ir para o painel
                                </Button>
                            )}
                        </div>
                    </section>
                )}

                {!vm.isLoading && !vm.loadError && state && phase === 'archived' && (
                    <section key="archived" className="projection-card projection-card--narrow" role="status">
                        <div className="projection-card__eyebrow">
                            <Badge variant="neutral">Sala arquivada</Badge>
                        </div>
                        <h1 className="projection-card__title">Esta sala foi encerrada</h1>
                        <p className="projection-card__subtitle">
                            A sala <strong>{state.roomName}</strong> foi arquivada pelo anfitrião e não recebe mais rodadas.
                        </p>
                        <div className="projection-card__actions">
                            <Button to="/dashboard" variant="primary">
                                Voltar ao painel
                            </Button>
                        </div>
                    </section>
                )}

                {!vm.isLoading && !vm.loadError && state && phase === 'waiting' && (
                    <section
                        key="waiting"
                        className="projection-card"
                        aria-labelledby="projection-waiting-title"
                    >
                        <div className="projection-card__eyebrow">
                            <Badge variant="warning">Aguardando início</Badge>
                            <Badge variant="info">{state.roomTheme}</Badge>
                        </div>

                        <h1 id="projection-waiting-title" className="projection-card__title">
                            {state.roomName}
                        </h1>

                        <div className="projection-lobby__join">
                            <p className="projection-lobby__instruction">
                                Acesse <strong>{joinAddress}</strong> no seu dispositivo e digite o código:
                            </p>
                            <p
                                className="projection-lobby__pin"
                                aria-label={`Código da sala: ${getClipboardRoomCode(state.roomCode).split('').join(' ')}`}
                            >
                                {formatRoomCode(state.roomCode)}
                            </p>
                        </div>

                        <ul className="projection-lobby__meta">
                            <li>{GAME_MODE_LABEL[state.gameMode]}</li>
                            <li>{state.timeLimit}s por pergunta</li>
                            <li>
                                {eligiblePlayerCount} / {state.maxPlayers} participantes conectados
                            </li>
                        </ul>

                        {state.players.length > 0 && (
                            <div className="projection-lobby__players">
                                <h2 className="projection-lobby__players-title">
                                    Participantes na sala ({state.players.length})
                                </h2>
                                <ul className="projection-lobby__players-list">
                                    {state.players.map((player) => (
                                        <li key={player.id} className="projection-lobby__player-pill">
                                            <PlayerAvatar
                                                avatarId={player.avatarId}
                                                nickname={player.nickname}
                                                size="xs"
                                                decorative
                                            />
                                            <span>{player.nickname}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>
                )}

                {!vm.isLoading && !vm.loadError && state && phase === 'between_rounds' && (
                    <section key="between" className="projection-card projection-card--narrow" role="status">
                        <div className="projection-card__eyebrow">
                            <Badge variant="success">Partida em andamento</Badge>
                        </div>
                        <h1 className="projection-card__title">Preparem-se!</h1>
                        <p className="projection-card__subtitle">
                            A partida foi iniciada. Aguardando o anfitrião liberar a próxima questão…
                        </p>
                        <div className="projection-waiting-pulse">
                            <span className="projection-waiting-pulse__dot" aria-hidden="true" />
                            <span>
                                {eligiblePlayerCount} participantes prontos · {state.timeLimit}s por questão
                            </span>
                        </div>
                    </section>
                )}

                {!vm.isLoading && !vm.loadError && state && phase === 'round_open' && activeRound && (
                    <section
                        key={`open-${activeRound.id}`}
                        className="projection-question"
                        aria-labelledby="projection-question-title"
                    >
                        <div className="projection-question__header">
                            <div className="projection-question__meta">
                                <span className="projection-question__counter">
                                    Rodada {activeRound.roundNumber}
                                    {roundTotalSuffix}
                                </span>
                                <Badge variant="neutral" className="projection-question__type">
                                    {QUESTION_TYPE_LABEL[activeRound.question.type]}
                                </Badge>
                                <span className="projection-question__status-pill">
                                    <Icon name="users" size={16} />
                                    <span>
                                        {state.answeredPlayerIds.length} de {eligiblePlayerCount} responderam
                                    </span>
                                    <span className="projection-question__responses-track" aria-hidden="true">
                                        <span
                                            className="projection-question__responses-fill"
                                            style={{ display: 'block', width: `${responsePercent}%` }}
                                        />
                                    </span>
                                </span>
                            </div>

                            <div
                                className={`projection-question__timer${timerStateClass ? ` ${timerStateClass}` : ''}`}
                                role="timer"
                                aria-label={
                                    !isTimeSynced
                                        ? 'Sincronizando cronômetro com o servidor'
                                        : isExpired
                                          ? 'Tempo encerrado'
                                          : `${remainingSeconds} segundos restantes`
                                }
                            >
                                <span className="projection-question__timer-icon" aria-hidden="true">
                                    <Icon name="timer" size={20} />
                                </span>
                                <div className="projection-question__timer-body">
                                    <span className="projection-question__timer-value">
                                        {isTimeSynced ? `${remainingSeconds}s` : '--s'}
                                    </span>
                                    <span className="projection-question__timer-label">
                                        {!isTimeSynced
                                            ? 'Sincronizando'
                                            : isExpired
                                              ? 'Encerrado'
                                              : 'restantes'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="projection-question__progress" aria-hidden="true">
                            <span
                                className={timerStateClass || undefined}
                                style={{ transform: `scaleX(${timeRatio})` }}
                            />
                        </div>

                        <div className="projection-question__statement-card">
                            <h1 id="projection-question-title" className="projection-question__statement">
                                {activeRound.question.statement}
                            </h1>
                        </div>

                        <div
                            className={`projection-options projection-options--${activeRound.question.options.length === 2 ? 'two' : 'many'}`}
                            role="list"
                            aria-label="Alternativas da questão"
                        >
                            {activeRound.question.options.map((option, index) => {
                                const optionTone = getQuestionOptionTone(
                                    activeRound.question.type,
                                    option.text,
                                    index,
                                    activeRound.question.options,
                                );
                                return (
                                    <div
                                        key={option.id}
                                        role="listitem"
                                        className={`projection-option projection-option--${optionTone}`}
                                    >
                                        <span className="projection-option__letter" aria-hidden="true">
                                            {CHOICE_LETTERS[index]}
                                        </span>
                                        <span className="projection-option__text">{option.text}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {!vm.isLoading && !vm.loadError && state && phase === 'round_closed' && closedRound && (() => {
                    const hasPartialRanking = closedRound.ranking.length > 0;
                    const totalParticipantsInRound =
                        closedRound.answeredCount + closedRound.unansweredCount;

                    return (
                    <section
                        key={`closed-${closedRound.id}`}
                        className="projection-question"
                        aria-labelledby="projection-closed-title"
                    >
                        <div className="projection-question__header">
                            <div className="projection-question__meta">
                                <span className="projection-question__counter">
                                    Rodada {closedRound.roundNumber}
                                    {roundTotalSuffix}
                                </span>
                                <Badge variant="info">Rodada encerrada · Gabarito</Badge>
                            </div>
                        </div>

                        <div className="projection-question__statement-card">
                            <h1 id="projection-closed-title" className="projection-question__statement">
                                {closedRound.question.statement}
                            </h1>
                        </div>

                        <div
                            className={`projection-options projection-options--${closedRound.question.options.length === 2 ? 'two' : 'many'}`}
                            role="list"
                            aria-label="Gabarito da rodada"
                        >
                            {closedRound.question.options.map((option, index) => {
                                const optionTone = getQuestionOptionTone(
                                    closedRound.question.type,
                                    option.text,
                                    index,
                                    closedRound.question.options,
                                );
                                return (
                                    <div
                                        key={option.id}
                                        role="listitem"
                                        className={`projection-option projection-option--${optionTone} ${
                                            option.isCorrect
                                                ? 'projection-option--correct'
                                                : 'projection-option--dimmed'
                                        }`}
                                    >
                                        <span className="projection-option__letter" aria-hidden="true">
                                            {CHOICE_LETTERS[index]}
                                        </span>
                                        <span className="projection-option__text">{option.text}</span>
                                        {option.isCorrect && (
                                            <span className="projection-option__correct-tag">
                                                <Icon name="check" size={16} />
                                                Resposta correta
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div
                            className={`projection-closed-footer${!hasPartialRanking ? ' projection-closed-footer--single' : ''}`}
                        >
                            <div className="projection-panel">
                                <div className="projection-panel__header">
                                    <h2 className="projection-panel__title">Resumo da rodada</h2>
                                    <span className="projection-panel__meta">
                                        {totalParticipantsInRound}{' '}
                                        {totalParticipantsInRound === 1 ? 'participante' : 'participantes'}
                                    </span>
                                </div>
                                <dl className="projection-stats">
                                    <div className="projection-stat projection-stat--correct">
                                        <dt>Acertos</dt>
                                        <dd className="is-correct">{closedRound.correctCount}</dd>
                                    </div>
                                    <div className="projection-stat projection-stat--wrong">
                                        <dt>Erros</dt>
                                        <dd className="is-wrong">{closedRound.wrongCount}</dd>
                                    </div>
                                    <div className="projection-stat projection-stat--muted">
                                        <dt>Sem resposta</dt>
                                        <dd className="is-muted">{closedRound.unansweredCount}</dd>
                                    </div>
                                </dl>
                            </div>

                            {hasPartialRanking && (
                                <div className="projection-panel">
                                    <div className="projection-panel__header">
                                        <h2 className="projection-panel__title">Placar parcial</h2>
                                        <span className="projection-panel__meta">
                                            Top {Math.min(5, closedRound.ranking.length)}
                                        </span>
                                    </div>
                                    <RankingList
                                        entries={toProjectionRankingEntries(closedRound.ranking)}
                                        limit={5}
                                    />
                                </div>
                            )}
                        </div>
                    </section>
                    );
                })()}

                {!vm.isLoading && !vm.loadError && state && phase === 'finished' && (
                    <section
                        key="finished"
                        className="projection-card"
                        aria-labelledby="projection-finished-title"
                    >
                        <div className="projection-card__eyebrow">
                            <Badge variant="success">Partida concluída</Badge>
                        </div>
                        <h1 id="projection-finished-title" className="projection-card__title">
                            Fim de jogo — {state.roomName}
                        </h1>
                        <p className="projection-card__subtitle">
                            Todas as rodadas foram encerradas. Confira o resultado final da turma!
                        </p>

                        {state.finalRanking.length > 0 && (
                            <>
                                <div className="projection-final__podium">
                                    <Podium ranking={state.finalRanking} />
                                </div>
                                <div className="projection-final__ranking">
                                    <RankingList entries={state.finalRanking} limit={8} />
                                </div>
                            </>
                        )}
                    </section>
                )}

                {!vm.isLoading && !vm.loadError && state && phase === 'cancelled' && (
                    <section key="cancelled" className="projection-card projection-card--narrow" role="status">
                        <div className="projection-card__eyebrow">
                            <Badge variant="warning">Partida cancelada</Badge>
                        </div>
                        <h1 className="projection-card__title">Partida encerrada antecipadamente</h1>
                        <p className="projection-card__subtitle">
                            A partida foi cancelada automaticamente porque restaram menos de 2 jogadores ativos na sala.
                        </p>
                    </section>
                )}
            </main>
        </div>
    );
}
