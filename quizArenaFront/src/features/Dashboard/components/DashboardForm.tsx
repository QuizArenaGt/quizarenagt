import { useEffect, useRef, useState, type FormEvent } from 'react';
import './DashboardForm.css';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardShell, {
    type DashboardActiveRoomSummary,
    type DashboardNavItem,
    type DashboardTabId,
} from '../../../components/layout/DashboardShell/DashboardShell';
import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import EmptyState from '../../../components/ui/EmptyState/EmptyState';
import Icon from '../../../components/ui/Icon/Icon';
import Modal from '../../../components/ui/Modal/Modal';
import { LoadingState } from '../../../components/ui/Skeleton/Skeleton';
import type { Question } from '../../../models/question';
import {
    GAME_MODE_LABEL,
    MIN_ROOM_PLAYERS,
    MIN_ROOM_QUESTIONS,
    ROOM_TIME_OPTIONS,
    canPlayAgain,
    countEligiblePlayers,
    evaluateStartMatchRequirements,
    formatNullableDateTime,
    formatRoomCode,
    resolveStartMatchFeedback,
    shouldClearStartMatchFeedbackOnRequirementsMet,
    type Room,
} from '../../../models/room';
import {
    computeGameHistoryAccuracyRate,
    filterRoomGamesByStatus,
    formatGameDuration,
    formatGameStatusLabel,
    formatRate,
    formatShortGameMode,
    type GameHistoryStatusFilter,
} from '../../../models/roomReport';
import type { ApiGameStatus } from '../../../services/roomStorageService';
import { useQuestionBankViewModel } from '../../../viewmodels/useQuestionBankViewModel';
import { useRoomsViewModel } from '../../../viewmodels/useRoomsViewModel';
import ImportQuestionsModal from '../../../views/Dashboard/ImportQuestionsModal/ImportQuestionsModal';
import QuestionFormModal from '../../../views/Dashboard/QuestionFormModal/QuestionFormModal';
import RoomCodeModal from '../../../views/Dashboard/RoomCodeModal/RoomCodeModal';
import RoomReportModal from '../../../views/Dashboard/RoomReportModal/RoomReportModal';
import ProfileModal from '../../../views/Dashboard/ProfileModal/ProfileModal';
import OverviewStats from '../../../views/Dashboard/OverviewStats/OverviewStats';
import { useProfileViewModel } from '../../../viewmodels/useProfileViewModel';
import type { GameMode } from '../../../services/socket';
import RoomDiscoveryList from './RoomDiscoveryList';
import RoomOverviewStatusBar from './RoomOverviewStatusBar';
import RoomPlayersCard from './RoomPlayersCard';
import RoomQuestionsList from './RoomQuestionsList';
import RoomSettingsSection from './RoomSettingsSection';
import RoomWorkspaceShell, { type RoomSectionId } from './RoomWorkspaceShell';

interface DashboardFormProps {
    authenticatedUserId?: string | null;
}

export default function DashboardForm({
    authenticatedUserId = null,
}: DashboardFormProps = {}) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<DashboardTabId>(() =>
        searchParams.get('aba') === 'visao-geral' && !searchParams.get('sala')?.trim()
            ? 'overview'
            : 'rooms',
    );
    const [isManagingRoom, setIsManagingRoom] = useState<boolean>(() =>
        Boolean(searchParams.get('sala')?.trim()),
    );
    const [roomSection, setRoomSection] = useState<RoomSectionId>('overview');
    const [questionPendingDeletion, setQuestionPendingDeletion] = useState<Question | null>(null);
    const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
    const [gameStatusFilter, setGameStatusFilter] = useState<GameHistoryStatusFilter>('ALL');
    const navigate = useNavigate();

    const profileVm = useProfileViewModel();
    const roomsVm = useRoomsViewModel(authenticatedUserId);
    const questionBank = useQuestionBankViewModel(roomsVm.activeRoom?.id ?? null);

    async function handleConfirmDeleteQuestion() {
        if (!questionPendingDeletion || isDeletingQuestion) return;
        setIsDeletingQuestion(true);
        try {
            await questionBank.deleteQuestion(questionPendingDeletion.id);
            setQuestionPendingDeletion(null);
        } finally {
            setIsDeletingQuestion(false);
        }
    }

    function handleLogout() {
        roomsVm.resetSessionState();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    }

    const activeRoom = roomsVm.activeRoom;
    const activeRoomId = activeRoom?.id ?? null;

    const navItems: DashboardNavItem[] = [
        {
            id: 'overview',
            label: 'Visão Geral',
            icon: 'dashboard',
        },
        {
            id: 'rooms',
            label: 'Salas',
            icon: 'rooms',
            badge: roomsVm.rooms.length > 0 ? roomsVm.rooms.length : undefined,
        },
    ];

    const activeRoomSummary: DashboardActiveRoomSummary | null = activeRoom
        ? {
              name: activeRoom.name,
              code: formatRoomCode(activeRoom.code),
              statusLabel: activeRoom.status,
              statusVariant:
                  activeRoom.status === 'Aguardando'
                      ? 'warning'
                      : activeRoom.status === 'Em Andamento'
                        ? 'success'
                        : 'neutral',
          }
        : null;

    const showingRoomWorkspace = activeTab === 'rooms' && isManagingRoom && activeRoom !== null;

    const currentHeader =
        activeTab === 'overview'
            ? {
                  title: 'Visão Geral',
                  subtitle: 'Desempenho analítico dos quizzes e questões, consolidado por sala.',
              }
            : showingRoomWorkspace
              ? {
                    title: 'Gerenciar Sala',
                    subtitle: activeRoom.name,
                }
              : {
                    title: 'Salas',
                    subtitle: 'Escolha uma sala para gerenciar ou crie uma nova arena.',
                };

    function exitRoomWorkspace() {
        setIsManagingRoom(false);
        setSearchParams(
            (prev) => {
                if (!prev.has('sala') && !prev.has('aba')) return prev;
                const next = new URLSearchParams(prev);
                next.delete('sala');
                next.delete('aba');
                return next;
            },
            { replace: true },
        );
    }

    function handleSelectGlobalTab(tab: DashboardTabId) {
        setActiveTab(tab);
        if (tab === 'rooms') {
            exitRoomWorkspace();
            return;
        }
        setIsManagingRoom(false);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('sala');
                next.set('aba', 'visao-geral');
                return next;
            },
            { replace: true },
        );
    }

    function handleEnterRoom(room: Room) {
        const isDifferentRoom = activeRoomId !== room.id;
        roomsVm.selectRoom(room);
        setActiveTab('rooms');
        setIsManagingRoom(true);
        if (isDifferentRoom) {
            setRoomSection('overview');
            setGameStatusFilter('ALL');
        }
    }

    function handleOpenActiveRoomFromSidebar() {
        if (!activeRoom) return;
        roomsVm.selectRoom(activeRoom);
        setActiveTab('rooms');
        setIsManagingRoom(true);
    }

    function handleBackToRoomsList() {
        setActiveTab('rooms');
        exitRoomWorkspace();
    }

    async function handleRoomModalSubmit(event: FormEvent<HTMLFormElement>) {
        const wasCreating = !roomsVm.editingRoom;
        const submitted = await roomsVm.submitRoom(event);
        if (submitted && wasCreating) {
            setActiveTab('rooms');
            setIsManagingRoom(true);
            setRoomSection('overview');
        }
    }
    const recordedRoomGames = roomsVm.roomGames.filter((item) => item.status !== 'WAITING');
    const activeLobbyPlayersCount = activeRoom
        ? countEligiblePlayers(activeRoom.players)
        : 0;
    const startRequirements = evaluateStartMatchRequirements(
        activeLobbyPlayersCount,
        questionBank.activeCount,
    );
    const { clearStartMatchFeedback, startMatchErrorKind } = roomsVm;
    const startMatchFeedback = resolveStartMatchFeedback({
        hasAttemptedStart: roomsVm.hasAttemptedStart,
        startMatchError: roomsVm.startMatchError,
        startMatchErrorKind,
    });

    const prevStartStateRef = useRef<{ roomId: string | null; canStart: boolean }>({
        roomId: null,
        canStart: false,
    });

    useEffect(() => {
        const previous = prevStartStateRef.current;

        if (
            previous.roomId === activeRoomId &&
            shouldClearStartMatchFeedbackOnRequirementsMet({
                previousCanStart: previous.canStart,
                currentCanStart: startRequirements.canStart,
                startMatchErrorKind,
            })
        ) {
            clearStartMatchFeedback();
        }

        prevStartStateRef.current = {
            roomId: activeRoomId,
            canStart: startRequirements.canStart,
        };
    }, [
        activeRoomId,
        startRequirements.canStart,
        startMatchErrorKind,
        clearStartMatchFeedback,
    ]);

    return (
        <>
            <DashboardShell
                navItems={navItems}
                activeTab={activeTab}
                onSelectTab={handleSelectGlobalTab}
                title={currentHeader.title}
                subtitle={currentHeader.subtitle}
                activeRoomSummary={activeRoomSummary}
                isManagingActiveRoom={showingRoomWorkspace}
                onOpenActiveRoom={handleOpenActiveRoomFromSidebar}
                userDisplayName={profileVm.displayName}
                userRoleLabel={profileVm.roleLabel}
                isProfileAvailable={Boolean(profileVm.profile)}
                onOpenProfile={profileVm.open}
                onLogout={handleLogout}
            >
                {/* ABA GLOBAL: Visão Geral (Dashboard Analítico por Sala) */}
                {activeTab === 'overview' && (
                    <OverviewStats
                        rooms={roomsVm.rooms}
                        activeRoomStats={roomsVm.roomStats}
                        isLoadingHostRooms={roomsVm.isLoadingHostRooms}
                        onGoToRooms={() => handleSelectGlobalTab('rooms')}
                    />
                )}

                {/* ABA GLOBAL: Salas — Listagem de descoberta */}
                {activeTab === 'rooms' && !showingRoomWorkspace && (
                    <RoomDiscoveryList
                        rooms={roomsVm.rooms}
                        activeRoomId={activeRoomId}
                        activeRoomQuestionCount={questionBank.activeCount}
                        isLoadingHostRooms={roomsVm.isLoadingHostRooms}
                        roomActionError={roomsVm.roomActionError}
                        hostRoomsError={roomsVm.hostRoomsError}
                        onReloadHostRooms={() => void roomsVm.reloadHostRooms()}
                        onCreateRoom={roomsVm.openCreate}
                        onOpenRoom={handleEnterRoom}
                    />
                )}

                {/* ABA GLOBAL: Salas — Gerenciamento contextual da sala selecionada */}
                {showingRoomWorkspace && activeRoom && (
                    <RoomWorkspaceShell
                        room={activeRoom}
                        activeSection={roomSection}
                        questionCount={questionBank.activeCount}
                        gamesCount={recordedRoomGames.length}
                        onSelectSection={setRoomSection}
                        onBackToList={handleBackToRoomsList}
                        onShowCode={roomsVm.showCode}
                    >
                        {roomsVm.roomActionError && (
                            <Alert variant="error" className="room-form-error">
                                {roomsVm.roomActionError}
                            </Alert>
                        )}

                        {/* SEÇÃO INTERNA: Visão geral da sala (Painel de Controle + Lobby / Placar ao Vivo) */}
                        {roomSection === 'overview' && (
                            <div className="room-overview-stack">
                                <RoomOverviewStatusBar
                                    room={activeRoom}
                                    canStart={startRequirements.canStart}
                                    activePlayersCount={activeLobbyPlayersCount}
                                    activeQuestionsCount={questionBank.activeCount}
                                    activeRoundNumber={roomsVm.activeRound?.roundNumber ?? null}
                                    closedRoundNumber={roomsVm.closedRound?.roundNumber ?? null}
                                    answeredCount={roomsVm.answeredPlayers.length}
                                    gamesCount={recordedRoomGames.length}
                                />

                                <div className="room-overview-grid">
                                    {/* Controle da sala e condução da partida */}
                                    <section className="room-detail-card room-detail-card--surface" aria-label="Controle da partida">
                                        {activeRoom.backendStatus === 'WAITING' && (
                                            <>
                                                <div>
                                                    <div className="room-detail-card__head room-detail-card__head--split">
                                                        <div>
                                                            <h3>Preparação para Iniciar</h3>
                                                            <p className="room-detail-card__desc">
                                                                Verifique os requisitos mínimos antes de liberar a primeira rodada.
                                                            </p>
                                                        </div>
                                                        <Badge variant={startRequirements.canStart ? 'success' : 'warning'}>
                                                            {startRequirements.canStart ? 'Tudo pronto' : 'Pendente'}
                                                        </Badge>
                                                    </div>

                                                    <ul className="room-checklist">
                                                        <li
                                                            className={`room-checklist__item ${
                                                                !startRequirements.missingQuestions
                                                                    ? 'is-met'
                                                                    : 'is-pending'
                                                            }`}
                                                        >
                                                            <span className="room-checklist__icon" aria-hidden="true">
                                                                <Icon
                                                                    name={!startRequirements.missingQuestions ? 'check' : 'questions'}
                                                                    size={16}
                                                                />
                                                            </span>
                                                            <div className="room-checklist__content">
                                                                <div className="room-checklist__title-row">
                                                                    <strong>Perguntas ativas</strong>
                                                                    <span className="room-checklist__ratio">
                                                                        {startRequirements.currentQuestions} / mín.{' '}
                                                                        {MIN_ROOM_QUESTIONS}
                                                                    </span>
                                                                </div>
                                                                <p className="room-checklist__hint">
                                                                    {!startRequirements.missingQuestions
                                                                        ? 'Quantidade mínima atendida.'
                                                                        : `Falta${startRequirements.missingQuestionsCount === 1 ? '' : 'm'} ${startRequirements.missingQuestionsCount} ${startRequirements.missingQuestionsCount === 1 ? 'pergunta' : 'perguntas'} para iniciar.`}
                                                                </p>
                                                            </div>
                                                            <div className="room-checklist__status">
                                                                {!startRequirements.missingQuestions ? (
                                                                    <Badge variant="success">Atendido</Badge>
                                                                ) : (
                                                                    <Button
                                                                        type="button"
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        onClick={() => setRoomSection('questions')}
                                                                    >
                                                                        Adicionar perguntas
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </li>

                                                        <li
                                                            className={`room-checklist__item ${
                                                                !startRequirements.missingPlayers
                                                                    ? 'is-met'
                                                                    : 'is-pending'
                                                            }`}
                                                        >
                                                            <span className="room-checklist__icon" aria-hidden="true">
                                                                <Icon
                                                                    name={!startRequirements.missingPlayers ? 'check' : 'users'}
                                                                    size={16}
                                                                />
                                                            </span>
                                                            <div className="room-checklist__content">
                                                                <div className="room-checklist__title-row">
                                                                    <strong>Jogadores no lobby</strong>
                                                                    <span className="room-checklist__ratio">
                                                                        {startRequirements.currentPlayers} / mín.{' '}
                                                                        {MIN_ROOM_PLAYERS}
                                                                    </span>
                                                                </div>
                                                                <p className="room-checklist__hint">
                                                                    {!startRequirements.missingPlayers
                                                                        ? 'Mínimo de participantes conectados.'
                                                                        : `Falta${startRequirements.missingPlayersCount === 1 ? '' : 'm'} ${startRequirements.missingPlayersCount} ${startRequirements.missingPlayersCount === 1 ? 'jogador' : 'jogadores'} conectado${startRequirements.missingPlayersCount === 1 ? '' : 's'}.`}
                                                                </p>
                                                            </div>
                                                            <div className="room-checklist__status">
                                                                <Badge
                                                                    variant={
                                                                        !startRequirements.missingPlayers
                                                                            ? 'success'
                                                                            : 'warning'
                                                                    }
                                                                >
                                                                    {!startRequirements.missingPlayers
                                                                        ? 'Atendido'
                                                                        : 'Aguardando'}
                                                                </Badge>
                                                            </div>
                                                        </li>
                                                    </ul>
                                                </div>

                                                {startMatchFeedback && (
                                                    <Alert variant="error">{startMatchFeedback}</Alert>
                                                )}

                                                <div className="room-start-cta-group">
                                                    <Button
                                                        type="button"
                                                        variant={startRequirements.canStart ? 'primary' : 'secondary'}
                                                        size="lg"
                                                        fullWidth
                                                        disabled={roomsVm.isStartingMatch}
                                                        isLoading={roomsVm.isStartingMatch}
                                                        onClick={() => void roomsVm.startMatch(activeRoom)}
                                                    >
                                                        <Icon name="play" size={16} />
                                                        <span>
                                                            {roomsVm.isStartingMatch
                                                                ? 'Iniciando Partida…'
                                                                : 'Iniciar Partida'}
                                                        </span>
                                                    </Button>
                                                    {!startRequirements.canStart && (
                                                        <p className="room-start-hint">
                                                            Atenda os dois requisitos acima para iniciar a partida sem bloqueios.
                                                        </p>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {activeRoom.backendStatus === 'IN_PROGRESS' && (
                                            <div className="room-round-panel">
                                                {roomsVm.activeRound ? (
                                                    <div className="room-round-panel__body">
                                                        <div className="room-round-panel__top">
                                                            <div>
                                                                <span className="room-round-eyebrow">
                                                                    {questionBank.activeCount > 0
                                                                        ? `Rodada ${roomsVm.activeRound.roundNumber} de ${questionBank.activeCount}`
                                                                        : `Rodada ${roomsVm.activeRound.roundNumber}`}
                                                                </span>
                                                                <h3>Pergunta em andamento</h3>
                                                            </div>
                                                            <Badge
                                                                variant={
                                                                    roomsVm.roundRemainingSeconds <= 5
                                                                        ? 'warning'
                                                                        : 'success'
                                                                }
                                                            >
                                                                <Icon name="timer" size={14} />
                                                                <span>{roomsVm.roundRemainingSeconds}s</span>
                                                            </Badge>
                                                        </div>

                                                        <div className="room-question-spotlight">
                                                            <p className="room-round-panel__statement">
                                                                {roomsVm.activeRound.question.statement}
                                                            </p>
                                                        </div>

                                                        <div className="room-response-progress">
                                                            <div className="room-response-progress__row">
                                                                <span>Respostas recebidas</span>
                                                                <strong>
                                                                    {roomsVm.answeredPlayers.length} de{' '}
                                                                    {countEligiblePlayers(activeRoom.players)}
                                                                </strong>
                                                            </div>
                                                            <div
                                                                className="room-progress-track"
                                                                aria-hidden="true"
                                                            >
                                                                <div
                                                                    className="room-progress-fill"
                                                                    style={{
                                                                        width: `${Math.min(
                                                                            100,
                                                                            Math.round(
                                                                                (roomsVm.answeredPlayers.length /
                                                                                    Math.max(
                                                                                        1,
                                                                                        countEligiblePlayers(
                                                                                            activeRoom.players,
                                                                                        ),
                                                                                    )) *
                                                                                    100,
                                                                            ),
                                                                        )}%`,
                                                                    }}
                                                                />
                                                            </div>
                                                            {roomsVm.answeredPlayers.length > 0 && (
                                                                <p className="room-round-panel__responses">
                                                                    Responderam:{' '}
                                                                    {roomsVm.answeredPlayers
                                                                        .map((p) => p.nickname)
                                                                        .join(', ')}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <Button
                                                            type="button"
                                                            variant="primary"
                                                            size="lg"
                                                            fullWidth
                                                            onClick={() => void roomsVm.closeCurrentRound()}
                                                            disabled={roomsVm.isClosingRound}
                                                            isLoading={roomsVm.isClosingRound}
                                                        >
                                                            {roomsVm.isClosingRound
                                                                ? 'Encerrando Rodada…'
                                                                : 'Encerrar Rodada'}
                                                        </Button>
                                                    </div>
                                                ) : roomsVm.closedRound ? (
                                                    <div className="room-round-panel__body">
                                                        <div className="room-round-panel__top">
                                                            <div>
                                                                <span className="room-round-eyebrow">
                                                                    {questionBank.activeCount > 0
                                                                        ? `Rodada ${roomsVm.closedRound.roundNumber} de ${questionBank.activeCount}`
                                                                        : `Rodada ${roomsVm.closedRound.roundNumber}`}
                                                                </span>
                                                                <h3>Rodada encerrada</h3>
                                                            </div>
                                                            <Badge variant="info">Aguardando avanço</Badge>
                                                        </div>

                                                        <div className="room-question-spotlight">
                                                            <p className="room-round-panel__statement">
                                                                {roomsVm.closedRound.question.statement}
                                                            </p>
                                                        </div>

                                                        <div className="room-round-panel__answer">
                                                            <Icon name="check" size={16} />
                                                            <span>
                                                                Resposta correta:{' '}
                                                                <strong>
                                                                    {
                                                                        roomsVm.closedRound.question.options.find(
                                                                            (o) => o.isCorrect,
                                                                        )?.text
                                                                    }
                                                                </strong>
                                                            </span>
                                                        </div>

                                                        <Button
                                                            type="button"
                                                            variant="primary"
                                                            size="lg"
                                                            fullWidth
                                                            disabled={roomsVm.isAdvancingRound}
                                                            isLoading={roomsVm.isAdvancingRound}
                                                            onClick={() => void roomsVm.advanceToNextRound()}
                                                        >
                                                            {roomsVm.isAdvancingRound
                                                                ? 'Avançando…'
                                                                : 'Próxima Rodada / Finalizar Partida'}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="room-round-panel__body">
                                                        <div className="room-detail-card__head">
                                                            <h3>Partida pronta para começar</h3>
                                                            <p className="room-detail-card__desc">
                                                                Abra a próxima rodada para enviar a pergunta e iniciar o cronômetro dos jogadores.
                                                            </p>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="primary"
                                                            size="lg"
                                                            fullWidth
                                                            disabled={roomsVm.isAdvancingRound}
                                                            isLoading={roomsVm.isAdvancingRound}
                                                            onClick={() => void roomsVm.advanceToNextRound()}
                                                        >
                                                            Abrir Próxima Rodada
                                                        </Button>
                                                    </div>
                                                )}

                                                <div className="room-control-danger-footer">
                                                    <span>Precisa finalizar antes de concluir as rodadas?</span>
                                                    <Button
                                                        type="button"
                                                        variant="danger"
                                                        size="sm"
                                                        disabled={roomsVm.isFinishingMatch}
                                                        isLoading={roomsVm.isFinishingMatch}
                                                        onClick={() => roomsVm.requestFinishMatch(activeRoom)}
                                                    >
                                                        {roomsVm.isFinishingMatch
                                                            ? 'Encerrando Partida…'
                                                            : 'Encerrar Partida'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {canPlayAgain(activeRoom) && (
                                            <div className="room-finished-panel">
                                                <div className="room-detail-card__head room-detail-card__head--split">
                                                    <div>
                                                        <h3
                                                            className={
                                                                activeRoom.backendStatus === 'CANCELLED'
                                                                    ? 'room-finished-title--cancelled'
                                                                    : 'room-finished-title--completed'
                                                            }
                                                        >
                                                            {activeRoom.backendStatus === 'FINISHED'
                                                                ? 'Partida Finalizada'
                                                                : activeRoom.backendStatus === 'CANCELLED'
                                                                  ? 'Partida Cancelada'
                                                                  : 'Partida Encerrada'}
                                                        </h3>
                                                        <p className="room-detail-card__desc">
                                                            {activeRoom.backendStatus === 'CANCELLED'
                                                                ? 'Esta sessão foi cancelada automaticamente.'
                                                                : 'Todas as rodadas foram concluídas com sucesso.'}
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        variant={
                                                            activeRoom.backendStatus === 'CANCELLED'
                                                                ? 'warning'
                                                                : 'success'
                                                        }
                                                    >
                                                        {activeRoom.backendStatus === 'CANCELLED'
                                                            ? 'Cancelada'
                                                            : 'Concluída'}
                                                    </Badge>
                                                </div>

                                                {activeRoom.backendStatus === 'CANCELLED' ? (
                                                    <Alert variant="warning">
                                                        A partida foi cancelada porque o número de jogadores ativos ficou abaixo do mínimo de 2 participantes. Não houve vencedor automático.
                                                    </Alert>
                                                ) : (
                                                    <p className="room-detail-empty-hint">
                                                        A classificação final e o relatório completo desta partida já estão disponíveis para consulta.
                                                    </p>
                                                )}

                                                <div className="room-finished-actions">
                                                    <Button
                                                        type="button"
                                                        variant="primary"
                                                        size="lg"
                                                        disabled={roomsVm.isPlayingAgain}
                                                        isLoading={roomsVm.isPlayingAgain}
                                                        onClick={() => void roomsVm.playAgain(activeRoom)}
                                                    >
                                                        {roomsVm.isPlayingAgain
                                                            ? 'Preparando nova partida…'
                                                            : 'Jogar novamente'}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="md"
                                                        onClick={() =>
                                                            roomsVm.openReport(activeRoom, questionBank.questions)
                                                        }
                                                    >
                                                        Ver Relatório Completo da Partida
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    {/* Lobby em tempo real / Placar */}
                                    <RoomPlayersCard
                                        players={activeRoom.players}
                                        maxPlayers={activeRoom.maxPlayers}
                                        activePlayersCount={activeLobbyPlayersCount}
                                        roomStatus={activeRoom.backendStatus}
                                        answeredPlayerIds={roomsVm.answeredPlayers.map((p) => p.id)}
                                        hasOpenRound={Boolean(roomsVm.activeRound)}
                                    />
                                </div>
                            </div>
                        )}

                        {/* SEÇÃO INTERNA: Perguntas da sala */}
                        {roomSection === 'questions' && (
                            <div className="room-section-surface">
                                <div className="room-section-header">
                                    <div>
                                        <div className="room-section-header__title-row">
                                            <h2>Perguntas da Sala</h2>
                                            <Badge
                                                variant={
                                                    questionBank.activeCount >= MIN_ROOM_QUESTIONS
                                                        ? 'success'
                                                        : 'warning'
                                                }
                                            >
                                                {questionBank.activeCount} / mín. {MIN_ROOM_QUESTIONS}
                                            </Badge>
                                        </div>
                                        <p className="room-section-header__meta">
                                            {questionBank.activeCount >= MIN_ROOM_QUESTIONS
                                                ? 'Quantidade mínima atendida para iniciar a partida.'
                                                : `Cadastre ou importe pelo menos ${MIN_ROOM_QUESTIONS} perguntas ativas para liberar o início da partida.`}
                                        </p>
                                    </div>
                                    {activeRoom.backendStatus === 'WAITING' && (
                                        <div className="room-section-header__actions">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={questionBank.openImport}
                                            >
                                                Importar JSON
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={questionBank.openCreate}
                                            >
                                                + Cadastrar Pergunta
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {activeRoom.backendStatus !== 'WAITING' && questionBank.questions.length > 0 && (
                                    <Alert variant="info">
                                        Esta sala já saiu da fase de espera; as perguntas ficam disponíveis apenas para consulta durante e após a partida.
                                    </Alert>
                                )}

                                {questionBank.error && (
                                    <Alert variant="error" className="room-form-error">
                                        {questionBank.error}
                                    </Alert>
                                )}

                                {questionBank.isLoading ? (
                                    <div className="room-detail-panel">
                                        <LoadingState label="Carregando perguntas da sala…" />
                                    </div>
                                ) : questionBank.questions.length === 0 ? (
                                    <EmptyState
                                        icon="questions"
                                        title="Nenhuma pergunta cadastrada nesta sala"
                                        description={
                                            activeRoom.backendStatus === 'WAITING'
                                                ? `Adicione pelo menos ${MIN_ROOM_QUESTIONS} perguntas manualmente ou importe em lote via JSON para liberar o início da partida.`
                                                : 'Nenhuma pergunta foi registrada nesta sala.'
                                        }
                                        action={
                                            activeRoom.backendStatus === 'WAITING' ? (
                                                <Button type="button" onClick={questionBank.openCreate}>
                                                    + Cadastrar Primeira Pergunta
                                                </Button>
                                            ) : undefined
                                        }
                                    />
                                ) : (
                                    <RoomQuestionsList
                                        questions={questionBank.questions}
                                        canEdit={activeRoom.backendStatus === 'WAITING'}
                                        onEdit={questionBank.openEdit}
                                        onRequestDelete={setQuestionPendingDeletion}
                                    />
                                )}
                            </div>
                        )}

                        {/* SEÇÃO INTERNA: Partidas da sala */}
                        {roomSection === 'games' && (() => {
                            const gameNumberById = new Map(
                                recordedRoomGames.map((item, idx) => [
                                    item.id,
                                    recordedRoomGames.length - idx,
                                ]),
                            );
                            const distinctStatuses = Array.from(
                                new Set(recordedRoomGames.map((item) => item.status)),
                            );
                            const filteredGames = filterRoomGamesByStatus(
                                recordedRoomGames,
                                gameStatusFilter,
                            );
                            const statusBadgeVariant = (status: ApiGameStatus) => {
                                if (status === 'IN_PROGRESS') return 'success' as const;
                                if (status === 'WAITING') return 'warning' as const;
                                if (status === 'CANCELLED') return 'danger' as const;
                                return 'neutral' as const;
                            };

                            return (
                                <div className="room-section-surface">
                                    <div className="room-section-header">
                                        <div>
                                            <h2>Histórico de Partidas ({recordedRoomGames.length})</h2>
                                            <p className="room-section-header__meta">
                                                Consulte o andamento, participantes, vencedor e relatório completo de cada partida.
                                            </p>
                                        </div>
                                        <div className="room-section-header__actions">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                disabled={roomsVm.isLoadingRoomGames}
                                                isLoading={roomsVm.isLoadingRoomGames}
                                                onClick={() => void roomsVm.refreshRoomGames()}
                                            >
                                                {roomsVm.isLoadingRoomGames ? 'Atualizando…' : 'Atualizar Histórico'}
                                            </Button>
                                        </div>
                                    </div>

                                    {roomsVm.roomGamesError && (
                                        <Alert variant="error" className="room-form-error">
                                            {roomsVm.roomGamesError}
                                        </Alert>
                                    )}

                                    {roomsVm.isLoadingRoomGames && roomsVm.roomGames.length === 0 ? (
                                        <div className="room-detail-panel">
                                            <LoadingState label="Carregando histórico de partidas…" />
                                        </div>
                                    ) : recordedRoomGames.length === 0 ? (
                                        <EmptyState
                                            icon="trophy"
                                            title="Nenhuma partida registrada nesta sala ainda"
                                            description="Assim que uma partida for iniciada nesta sala, os resultados e relatórios aparecerão aqui."
                                            action={
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() => setRoomSection('overview')}
                                                >
                                                    Voltar para Visão geral da sala
                                                </Button>
                                            }
                                        />
                                    ) : (
                                        <div className="game-history">
                                            {distinctStatuses.length > 1 && (
                                                <div
                                                    className="game-history__filters"
                                                    role="group"
                                                    aria-label="Filtrar partidas por status"
                                                >
                                                    <button
                                                        type="button"
                                                        className={`question-bank__filter-chip ${gameStatusFilter === 'ALL' ? 'is-active' : ''}`}
                                                        aria-pressed={gameStatusFilter === 'ALL'}
                                                        onClick={() => setGameStatusFilter('ALL')}
                                                    >
                                                        Todas ({recordedRoomGames.length})
                                                    </button>
                                                    {distinctStatuses.map((status) => {
                                                        const count = recordedRoomGames.filter(
                                                            (item) => item.status === status,
                                                        ).length;
                                                        return (
                                                            <button
                                                                key={status}
                                                                type="button"
                                                                className={`question-bank__filter-chip ${gameStatusFilter === status ? 'is-active' : ''}`}
                                                                aria-pressed={gameStatusFilter === status}
                                                                onClick={() => setGameStatusFilter(status)}
                                                            >
                                                                {formatGameStatusLabel(status)} ({count})
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {filteredGames.length === 0 ? (
                                                <EmptyState
                                                    icon="trophy"
                                                    title="Nenhuma partida corresponde ao filtro selecionado"
                                                    description="Altere ou limpe o filtro para visualizar todo o histórico desta sala."
                                                    action={
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            onClick={() => setGameStatusFilter('ALL')}
                                                        >
                                                            Mostrar todas as partidas
                                                        </Button>
                                                    }
                                                />
                                            ) : (
                                                <div className="game-history__card">
                                                    <div className="game-history__head" aria-hidden="true">
                                                        <span>Partida e data</span>
                                                        <span>Status e duração</span>
                                                        <span>Participação</span>
                                                        <span>Resultado</span>
                                                        <span className="game-history__head-action">Relatório</span>
                                                    </div>

                                                    <ul className="game-history__list" aria-label="Partidas da sala">
                                                        {filteredGames.map((game) => {
                                                            const matchNumber = gameNumberById.get(game.id) ?? 1;
                                                            const formattedDate = formatNullableDateTime(
                                                                game.startedAt ?? game.createdAt,
                                                            );
                                                            const formattedDuration = formatGameDuration(
                                                                game.durationMs,
                                                                game.status,
                                                            );

                                                            return (
                                                                <li key={game.id} className="game-history__item">
                                                                    <div className="game-history__col-match">
                                                                        <div className="game-history__match-title">
                                                                            <span className="game-history__number">
                                                                                #{matchNumber}
                                                                            </span>
                                                                            <span className="game-history__mode">
                                                                                {formatShortGameMode(game.gameMode)}
                                                                            </span>
                                                                        </div>
                                                                        <span className="game-history__date">
                                                                            {formattedDate}
                                                                        </span>
                                                                    </div>

                                                                    <div className="game-history__col-status">
                                                                        <Badge variant={statusBadgeVariant(game.status)}>
                                                                            {formatGameStatusLabel(game.status)}
                                                                        </Badge>
                                                                        <span className="game-history__duration">
                                                                            <Icon name="timer" size={13} />
                                                                            {formattedDuration}
                                                                        </span>
                                                                    </div>

                                                                    <div className="game-history__col-players">
                                                                        <span className="game-history__mobile-label">
                                                                            Participação e acerto
                                                                        </span>
                                                                        <span className="game-history__players-value">
                                                                            <Icon name="users" size={14} />
                                                                            {game.playerCount}{' '}
                                                                            {game.playerCount === 1
                                                                                ? 'jogador'
                                                                                : 'jogadores'}
                                                                        </span>
                                                                        {(() => {
                                                                            const avgRate = computeGameHistoryAccuracyRate(game);
                                                                            return (
                                                                                <span className="game-history__players-accuracy">
                                                                                    {avgRate !== null
                                                                                        ? `Acerto médio: ${formatRate(avgRate)}`
                                                                                        : 'Sem respostas'}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </div>

                                                                    <div className="game-history__col-result">
                                                                        <span className="game-history__mobile-label">
                                                                            Resultado
                                                                        </span>
                                                                        {game.winner ? (
                                                                            <div className="game-history__winner">
                                                                                <Icon name="trophy" size={14} />
                                                                                <span className="game-history__winner-name">
                                                                                    {game.winner.nickname}
                                                                                </span>
                                                                                <span className="game-history__winner-score">
                                                                                    {game.winner.score} pts
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="game-history__muted">
                                                                                {game.status === 'IN_PROGRESS'
                                                                                    ? 'Partida em andamento'
                                                                                    : game.status === 'CANCELLED'
                                                                                      ? 'Sem vencedor (cancelada)'
                                                                                      : 'Sem vencedor'}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className="game-history__col-action">
                                                                        <Button
                                                                            type="button"
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            onClick={() =>
                                                                                void roomsVm.openGameReport(
                                                                                    activeRoom,
                                                                                    game.id,
                                                                                )
                                                                            }
                                                                        >
                                                                            Ver resultados
                                                                        </Button>
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* SEÇÃO INTERNA: Configurações da sala */}
                        {roomSection === 'settings' && (
                            <RoomSettingsSection
                                room={activeRoom}
                                isFinishingMatch={roomsVm.isFinishingMatch}
                                onEditRoom={roomsVm.openEdit}
                                onShowCode={roomsVm.showCode}
                                onRequestFinishMatch={roomsVm.requestFinishMatch}
                                onRequestDeleteRoom={roomsVm.requestDelete}
                            />
                        )}
                    </RoomWorkspaceShell>
                )}
            </DashboardShell>

            {/* Modal: Criar / Editar Sala */}
            <Modal
                isOpen={roomsVm.isCreateOpen}
                onClose={roomsVm.closeCreate}
                closeDisabled={roomsVm.isSubmittingRoom}
                title={roomsVm.isEditing ? 'Editar Sala' : 'Criar e Configurar Nova Sala'}
            >
                <form
                    className="room-modal-form"
                    onSubmit={(e) => void handleRoomModalSubmit(e)}
                    noValidate
                >
                    <div className="form-group">
                        <label htmlFor="room-name">Nome da Sala</label>
                        <input
                            id="room-name"
                            type="text"
                            value={roomsVm.form.name}
                            onChange={(e) => roomsVm.setName(e.target.value)}
                            placeholder="Ex: Arena de Programação"
                            disabled={roomsVm.isSubmittingRoom}
                            className={roomsVm.fieldErrors.name ? 'is-invalid' : undefined}
                            aria-required="true"
                            aria-invalid={Boolean(roomsVm.fieldErrors.name)}
                            aria-describedby={roomsVm.fieldErrors.name ? 'room-name-error' : undefined}
                        />
                        {roomsVm.fieldErrors.name && (
                            <p id="room-name-error" className="room-field-error" role="alert">
                                {roomsVm.fieldErrors.name}
                            </p>
                        )}
                    </div>
                    <div className="form-group">
                        <label htmlFor="room-theme">Tema</label>
                        <input
                            id="room-theme"
                            type="text"
                            value={roomsVm.form.theme}
                            onChange={(e) => roomsVm.setTheme(e.target.value)}
                            placeholder="Ex: React & TypeScript"
                            disabled={roomsVm.isSubmittingRoom}
                            className={roomsVm.fieldErrors.theme ? 'is-invalid' : undefined}
                            aria-required="true"
                            aria-invalid={Boolean(roomsVm.fieldErrors.theme)}
                            aria-describedby={roomsVm.fieldErrors.theme ? 'room-theme-error' : undefined}
                        />
                        {roomsVm.fieldErrors.theme && (
                            <p id="room-theme-error" className="room-field-error" role="alert">
                                {roomsVm.fieldErrors.theme}
                            </p>
                        )}
                    </div>
                    <div className="form-group">
                        <label htmlFor="room-max-players">Máximo de Jogadores (2 a 50)</label>
                        <input
                            id="room-max-players"
                            type="number"
                            inputMode="numeric"
                            value={
                                Number.isNaN(roomsVm.form.maxPlayers)
                                    ? ''
                                    : String(roomsVm.form.maxPlayers)
                            }
                            onChange={(e) =>
                                roomsVm.setMaxPlayers(
                                    e.target.value === '' ? Number.NaN : Number(e.target.value),
                                )
                            }
                            disabled={roomsVm.isSubmittingRoom}
                            className={roomsVm.fieldErrors.maxPlayers ? 'is-invalid' : undefined}
                            aria-required="true"
                            aria-invalid={Boolean(roomsVm.fieldErrors.maxPlayers)}
                            aria-describedby={
                                roomsVm.fieldErrors.maxPlayers
                                    ? 'room-max-players-error'
                                    : undefined
                            }
                        />
                        {roomsVm.fieldErrors.maxPlayers && (
                            <p
                                id="room-max-players-error"
                                className="room-field-error"
                                role="alert"
                            >
                                {roomsVm.fieldErrors.maxPlayers}
                            </p>
                        )}
                    </div>
                    <div className="form-group">
                        <label htmlFor="room-time">Tempo Limite por Questão (segundos)</label>
                        <select
                            id="room-time"
                            value={roomsVm.form.timeLimit}
                            onChange={(e) => roomsVm.setTimeLimit(Number(e.target.value))}
                            disabled={roomsVm.isSubmittingRoom}
                            className={roomsVm.fieldErrors.timeLimit ? 'is-invalid' : undefined}
                            aria-invalid={Boolean(roomsVm.fieldErrors.timeLimit)}
                            aria-describedby={
                                roomsVm.fieldErrors.timeLimit ? 'room-time-error' : undefined
                            }
                        >
                            {ROOM_TIME_OPTIONS.map((seconds) => (
                                <option key={seconds} value={seconds}>
                                    {seconds} segundos
                                </option>
                            ))}
                        </select>
                        {roomsVm.fieldErrors.timeLimit && (
                            <p id="room-time-error" className="room-field-error" role="alert">
                                {roomsVm.fieldErrors.timeLimit}
                            </p>
                        )}
                    </div>
                    <div className="form-group">
                        <label htmlFor="room-mode">Modo de Jogo</label>
                        <select
                            id="room-mode"
                            value={roomsVm.form.gameMode}
                            onChange={(e) => roomsVm.setGameMode(e.target.value as GameMode)}
                            disabled={roomsVm.isSubmittingRoom}
                            className={roomsVm.fieldErrors.gameMode ? 'is-invalid' : undefined}
                            aria-invalid={Boolean(roomsVm.fieldErrors.gameMode)}
                            aria-describedby={
                                roomsVm.fieldErrors.gameMode ? 'room-mode-error' : undefined
                            }
                        >
                            {(Object.keys(GAME_MODE_LABEL) as GameMode[]).map((mode) => (
                                <option key={mode} value={mode}>
                                    {GAME_MODE_LABEL[mode]}
                                </option>
                            ))}
                        </select>
                        {roomsVm.fieldErrors.gameMode && (
                            <p id="room-mode-error" className="room-field-error" role="alert">
                                {roomsVm.fieldErrors.gameMode}
                            </p>
                        )}
                    </div>

                    {roomsVm.formError && (
                        <Alert variant="error" className="room-form-alert">
                            {roomsVm.formError}
                        </Alert>
                    )}

                    <p className="room-form-note">
                        {roomsVm.editingRoom ? (
                            <>
                                O código da sala continua o mesmo:{' '}
                                <strong>{formatRoomCode(roomsVm.editingRoom.code)}</strong>.
                            </>
                        ) : (
                            'Após criar a sala, cadastre pelo menos 5 perguntas dentro dela para iniciar a partida.'
                        )}
                    </p>
                    <div className="modal-actions">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={roomsVm.closeCreate}
                            disabled={roomsVm.isSubmittingRoom}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" isLoading={roomsVm.isSubmittingRoom}>
                            {roomsVm.isSubmittingRoom
                                ? 'Salvando…'
                                : roomsVm.isEditing
                                  ? 'Salvar alterações'
                                  : 'Criar sala'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Tela de exibição do código da sala (para projetar aos alunos) */}
            <RoomCodeModal room={roomsVm.displayedRoom} onClose={roomsVm.hideCode} />

            {/* Perfil do usuário */}
            <ProfileModal
                isOpen={profileVm.isOpen}
                profile={profileVm.profile}
                roleLabel={profileVm.roleLabel}
                license={profileVm.license}
                draft={profileVm.draft}
                errors={profileVm.errors}
                isSaving={profileVm.isSaving}
                savedMessage={profileVm.savedMessage}
                onFieldChange={profileVm.setField}
                onSubmit={profileVm.submit}
                onClose={profileVm.close}
            />

            {/* Relatório da sala finalizada */}
            <RoomReportModal view={roomsVm.reportView} onClose={roomsVm.closeReport} />

            {/* Confirmação antes de excluir uma sala (soft delete) */}
            <ConfirmDialog
                isOpen={roomsVm.roomPendingDeletion !== null}
                title="Excluir sala?"
                confirmLabel="Excluir sala"
                loadingLabel="Excluindo..."
                isLoading={roomsVm.isArchivingRoom}
                tone="danger"
                onConfirm={roomsVm.confirmDelete}
                onCancel={roomsVm.cancelDelete}
            >
                <p>
                    A sala <strong>{roomsVm.roomPendingDeletion?.name}</strong> (código{' '}
                    <strong>
                        {roomsVm.roomPendingDeletion && formatRoomCode(roomsVm.roomPendingDeletion.code)}
                    </strong>
                    ) deixará de aparecer na lista de salas ativas e não aceitará novos jogadores ou novas partidas.
                </p>
                <p className="confirm-dialog__note">
                    O histórico de partidas e os resultados anteriores permanecerão preservados.
                </p>
                {roomsVm.archiveRoomError && (
                    <Alert variant="error" className="confirm-dialog__alert">
                        {roomsVm.archiveRoomError}
                    </Alert>
                )}
            </ConfirmDialog>

            {/* Confirmação antes de encerrar antecipadamente uma partida em andamento */}
            <ConfirmDialog
                isOpen={roomsVm.roomPendingFinish !== null}
                title="Encerrar partida agora?"
                confirmLabel="Encerrar Partida"
                loadingLabel="Encerrando…"
                isLoading={roomsVm.isFinishingMatch}
                tone="danger"
                onConfirm={roomsVm.confirmFinishMatch}
                onCancel={roomsVm.cancelFinishMatch}
            >
                <p>
                    A partida em andamento na sala <strong>{roomsVm.roomPendingFinish?.name}</strong> (código{' '}
                    <strong>
                        {roomsVm.roomPendingFinish && formatRoomCode(roomsVm.roomPendingFinish.code)}
                    </strong>
                    ) será finalizada imediatamente.
                </p>
                <p className="confirm-dialog__note">
                    As pontuações atuais dos jogadores serão preservadas, qualquer rodada aberta será encerrada e todos
                    serão direcionados aos resultados finais.
                </p>
                {roomsVm.finishMatchError && (
                    <Alert variant="error" className="confirm-dialog__alert">
                        {roomsVm.finishMatchError}
                    </Alert>
                )}
            </ConfirmDialog>

            {/* Confirmação antes de excluir uma pergunta da sala */}
            <ConfirmDialog
                isOpen={questionPendingDeletion !== null}
                title="Excluir pergunta?"
                confirmLabel="Excluir pergunta"
                loadingLabel="Excluindo…"
                isLoading={isDeletingQuestion}
                tone="danger"
                onConfirm={() => void handleConfirmDeleteQuestion()}
                onCancel={() => {
                    if (!isDeletingQuestion) {
                        setQuestionPendingDeletion(null);
                    }
                }}
            >
                <p>
                    A pergunta <strong>“{questionPendingDeletion?.statement}”</strong> será removida
                    desta sala permanentemente.
                </p>
            </ConfirmDialog>

            {/* Modal: Cadastrar / Editar Pergunta (vinculada à sala ativa) */}
            <QuestionFormModal
                isOpen={questionBank.isFormOpen}
                question={questionBank.editingQuestion}
                onClose={questionBank.closeForm}
                onSave={questionBank.saveQuestion}
            />

            {/* Modal: Importar Perguntas em Lote via JSON */}
            <ImportQuestionsModal
                isOpen={questionBank.isImportOpen}
                roomId={activeRoom?.id ?? null}
                roomName={activeRoom?.name ?? ''}
                roomStatus={activeRoom?.backendStatus ?? null}
                existingQuestions={questionBank.questions}
                isImporting={questionBank.isImporting}
                onImportBatch={questionBank.importQuestionsBatch}
                onClose={questionBank.closeImport}
            />
        </>
    );
}
