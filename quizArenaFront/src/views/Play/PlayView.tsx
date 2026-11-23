import { Link } from 'react-router-dom';
import Logo from '../../components/ui/Logo/Logo';
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
    const { phase } = viewModel;
    const isInGame = phase === 'question' || phase === 'feedback';

    return (
        <div className="play">
            <header className="play__topbar">
                <Link to="/" className="play__brand" aria-label="QuizArenaGT, página inicial">
                    <Logo variant="dark" withBadge size={34} />
                </Link>

                <div className="play__topbar-info">
                    {isInGame && (
                        <span className="play__chip play__chip--score">
                            {viewModel.totalScore} pts
                        </span>
                    )}
                    <button
                        type="button"
                        className="play__leave"
                        onClick={() => void viewModel.leaveRoom()}
                        disabled={viewModel.isLeaving}
                    >
                        {viewModel.isLeaving ? 'Saindo...' : 'Sair'}
                    </button>
                </div>
            </header>

            {viewModel.leaveError && (
                <div className="play__leave-error" role="alert">
                    {viewModel.leaveError}
                </div>
            )}

            <main className="play__stage">
                {viewModel.isRecovering && (
                    <section className="play-card play-card--center" aria-live="polite">
                        <h1 className="play-card__title">Recuperando sessão…</h1>
                        <p className="play-card__text">
                            Sincronizando sua participação na sala atual.
                        </p>
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
                        nickname={viewModel.nickname}
                        error={viewModel.error}
                        isJoining={viewModel.isJoining}
                        onNicknameChange={viewModel.changeNickname}
                        onSubmit={viewModel.submitNickname}
                    />
                )}

                {phase === 'lobby' && viewModel.room && (
                    <LobbyStep
                        room={viewModel.room}
                        nickname={viewModel.nickname}
                        playerId={viewModel.playerId}
                        players={viewModel.lobbyPlayers}
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
        </div>
    );
}
