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

/*
 * VIEW da experiência do aluno (rota /jogar).
 *
 * Mostra uma etapa por vez, de acordo com `phase` do usePlayViewModel.
 * Cada etapa é uma subview que só recebe dados e callbacks por props.
 */
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
                    {viewModel.room?.isDemo && <span className="play__chip">Modo demonstração</span>}
                    {isInGame && (
                        <span className="play__chip play__chip--score">
                            {viewModel.totalScore} pts
                        </span>
                    )}
                    <button type="button" className="play__leave" onClick={viewModel.leaveRoom}>
                        Sair
                    </button>
                </div>
            </header>

            <main className="play__stage">
                {phase === 'join' && (
                    <JoinStep
                        pin={viewModel.pin}
                        error={viewModel.error}
                        isJoining={viewModel.isJoining}
                        onPinChange={viewModel.setPin}
                        onSubmit={viewModel.submitPin}
                    />
                )}

                {phase === 'nickname' && (
                    <NicknameStep
                        nickname={viewModel.nickname}
                        error={viewModel.error}
                        onNicknameChange={viewModel.changeNickname}
                        onSubmit={viewModel.submitNickname}
                    />
                )}

                {phase === 'lobby' && viewModel.room && (
                    <LobbyStep room={viewModel.room} nickname={viewModel.nickname} onStart={viewModel.startGame} />
                )}

                {phase === 'question' && viewModel.currentQuestion && viewModel.room && (
                    // A key força uma nova montagem a cada pergunta (foco e animação).
                    <QuestionStep
                        key={viewModel.currentQuestion.id}
                        question={viewModel.currentQuestion}
                        questionNumber={viewModel.questionNumber}
                        totalQuestions={viewModel.totalQuestions}
                        remainingSeconds={viewModel.remainingSeconds}
                        timeLimit={viewModel.room.timePerQuestion}
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
                        isLastQuestion={viewModel.isLastQuestion}
                        onNext={viewModel.goToNext}
                    />
                )}

                {phase === 'finished' && viewModel.room && (
                    <ResultStep
                        nickname={viewModel.nickname}
                        questions={viewModel.room.questions}
                        answers={viewModel.answers}
                        totalScore={viewModel.totalScore}
                        correctCount={viewModel.correctCount}
                        ranking={viewModel.ranking}
                        playerPosition={viewModel.playerRanking?.position ?? null}
                        isDemo={viewModel.room.isDemo}
                        onPlayAgain={viewModel.playAgain}
                        onLeave={viewModel.leaveRoom}
                    />
                )}
            </main>
        </div>
    );
}
