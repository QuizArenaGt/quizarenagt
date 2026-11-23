import { useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/ui/Alert/Alert';
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog';
import Icon from '../../components/ui/Icon/Icon';
import Logo from '../../components/ui/Logo/Logo';
import { PlayerAvatar } from '../../components/ui/PlayerAvatar/PlayerAvatar';
import { LoadingState } from '../../components/ui/Skeleton/Skeleton';
import { getPlayExitState } from '../../models/game';
import { usePlayViewModel } from '../../viewmodels/usePlayViewModel';
import FeedbackStep from './steps/FeedbackStep';
import JoinStep from './steps/JoinStep';
import LobbyStep from './steps/LobbyStep';
import NicknameStep from './steps/NicknameStep';
import QuestionStep from './steps/QuestionStep';
import ResultStep from './steps/ResultStep';
import './PlayView.css';

export default function PlayView() {
    const viewModel = usePlayViewModel();
    const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
    const { phase, socketStatus } = viewModel;
    const isInGame = phase === 'question' || phase === 'feedback';
    const isLiveRoom = phase === 'lobby' || isInGame;
    const exitState = getPlayExitState(phase, viewModel.isRecovering);
    const isConfirmVisible = isLeaveConfirmOpen && exitState.requiresConfirmation;

    const connectionLabel =
        socketStatus === 'connected'
            ? 'Ao vivo'
            : socketStatus === 'reconnecting'
              ? 'Reconectando…'
              : 'Conectando…';

    function handleTopbarExitClick() {
        if (exitState.requiresConfirmation) {
            setIsLeaveConfirmOpen(true);
            return;
        }
        void viewModel.leaveRoom();
    }

    async function handleConfirmLeave() {
        await viewModel.leaveRoom();
        setIsLeaveConfirmOpen(false);
    }

    return (
        <div className={`play play--phase-${phase}`}>
            <header className="play__topbar">
                {exitState.requiresConfirmation ? (
                    <span className="play__brand" aria-label="QuizArenaGT">
                        <Logo variant="dark" withBadge size={34} />
                    </span>
                ) : (
                    <Link to="/" className="play__brand" aria-label="QuizArenaGT, página inicial">
                        <Logo variant="dark" withBadge size={34} />
                    </Link>
                )}

                <div className="play__topbar-info">
                    {isLiveRoom && socketStatus !== 'idle' && (
                        <span
                            className={`play__chip play__chip--connection is-${socketStatus}`}
                            role="status"
                            aria-live="polite"
                        >
                            <span className="play__conn-dot" aria-hidden="true" />
                            <span>{connectionLabel}</span>
                        </span>
                    )}

                    {isInGame && viewModel.nickname && (
                        <span className="play__chip play__chip--player" title={viewModel.nickname}>
                            <PlayerAvatar
                                avatarId={viewModel.avatarId}
                                nickname={viewModel.nickname}
                                size="xs"
                                decorative
                            />
                            <span className="play__chip-player-name">{viewModel.nickname}</span>
                        </span>
                    )}

                    {isInGame && viewModel.room && (
                        <span className="play__chip play__chip--room" title={viewModel.room.title}>
                            <Icon name="rooms" size={14} />
                            <span className="play__chip-room-name">{viewModel.room.title}</span>
                        </span>
                    )}

                    {isInGame && (
                        <span className="play__chip play__chip--score">
                            <Icon name="trophy" size={14} />
                            <span>{viewModel.totalScore} pts</span>
                        </span>
                    )}

                    <button
                        type="button"
                        className={`play__leave${exitState.requiresConfirmation ? ' play__leave--danger' : ''}`}
                        onClick={handleTopbarExitClick}
                        disabled={viewModel.isLeaving}
                    >
                        {viewModel.isLeaving ? 'Saindo…' : exitState.label}
                    </button>
                </div>
            </header>

            {isLiveRoom && socketStatus === 'reconnecting' && (
                <div className="play__banner">
                    <Alert variant="warning">
                        Conexão instável. Tentando reconectar automaticamente à sala…
                    </Alert>
                </div>
            )}

            {viewModel.leaveError && !isConfirmVisible && (
                <div className="play__banner">
                    <Alert variant="error">{viewModel.leaveError}</Alert>
                </div>
            )}

            <main className="play__stage">
                {viewModel.isRecovering && (
                    <section className="play-card play-card--center" aria-live="polite">
                        <LoadingState label="Recuperando sessão e sincronizando a sala…" />
                    </section>
                )}

                {!viewModel.isRecovering && phase === 'join' && (
                    <JoinStep
                        pin={viewModel.pin}
                        error={viewModel.error}
                        isJoining={viewModel.isJoining}
                        onPinChange={viewModel.setPin}
                        onSubmit={viewModel.submitPin}
                    />
                )}

                {!viewModel.isRecovering && phase === 'nickname' && (
                    <NicknameStep
                        pin={viewModel.pin}
                        nickname={viewModel.nickname}
                        avatarId={viewModel.avatarId}
                        error={viewModel.error}
                        isJoining={viewModel.isJoining}
                        onNicknameChange={viewModel.changeNickname}
                        onAvatarSelect={viewModel.selectAvatar}
                        onSubmit={viewModel.submitNickname}
                    />
                )}

                {phase === 'lobby' && viewModel.room && (
                    <LobbyStep
                        room={viewModel.room}
                        nickname={viewModel.nickname}
                        avatarId={viewModel.avatarId}
                        playerId={viewModel.playerId}
                        players={viewModel.lobbyPlayers}
                        socketStatus={socketStatus}
                    />
                )}

                {phase === 'question' && viewModel.currentQuestion && (
                    <QuestionStep
                        key={`${viewModel.questionNumber}-${viewModel.currentQuestion.id}`}
                        question={viewModel.currentQuestion}
                        questionNumber={viewModel.questionNumber}
                        totalQuestions={viewModel.totalQuestions}
                        remainingSeconds={viewModel.remainingSeconds}
                        timeLimit={viewModel.currentTimeLimit}
                        selectedOptionId={viewModel.selectedOptionId}
                        hasSubmittedAnswer={viewModel.hasSubmittedAnswer}
                        isSubmittingAnswer={viewModel.isSubmittingAnswer}
                        answerError={viewModel.answerError}
                        onAnswer={viewModel.answer}
                    />
                )}

                {phase === 'feedback' && viewModel.currentQuestion && viewModel.lastAnswer && (
                    <FeedbackStep
                        question={viewModel.currentQuestion}
                        answer={viewModel.lastAnswer}
                        totalScore={viewModel.totalScore}
                        ranking={viewModel.ranking}
                        playerPosition={viewModel.playerRanking?.position ?? null}
                    />
                )}

                {phase === 'finished' && (
                    <ResultStep
                        nickname={viewModel.nickname}
                        questions={viewModel.playedQuestions}
                        answers={viewModel.answers}
                        totalScore={viewModel.totalScore}
                        correctCount={viewModel.correctCount}
                        ranking={viewModel.ranking}
                        playerPosition={viewModel.playerRanking?.position ?? null}
                        isGameCancelled={viewModel.isGameCancelled}
                        onPlayAgain={viewModel.playAgain}
                        onLeave={() => void viewModel.leaveRoom()}
                    />
                )}
            </main>

            <ConfirmDialog
                isOpen={isConfirmVisible}
                title={exitState.confirmTitle}
                confirmLabel={exitState.confirmLabel}
                loadingLabel="Saindo…"
                isLoading={viewModel.isLeaving}
                tone="danger"
                onConfirm={() => void handleConfirmLeave()}
                onCancel={() => setIsLeaveConfirmOpen(false)}
            >
                <p>{exitState.confirmMessage}</p>
                {viewModel.leaveError && (
                    <Alert variant="error">{viewModel.leaveError}</Alert>
                )}
            </ConfirmDialog>
        </div>
    );
}
