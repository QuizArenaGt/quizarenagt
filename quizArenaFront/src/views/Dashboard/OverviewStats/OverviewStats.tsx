import type { Question } from '../../../models/question';
import type { Room } from '../../../models/room';
import { formatRate, type QuestionReportRow } from '../../../models/roomReport';
import { useOverviewViewModel } from '../../../viewmodels/useOverviewViewModel';
import RateBar from '../components/RateBar';
import '../reports.css';
import './OverviewStats.css';

interface OverviewStatsProps {
    rooms: Room[];
    questions: Question[];
    onOpenReport: (room: Room) => void;
}

/**
 * VIEW — estatísticas dos quizzes realizados, exibidas na Visão Geral.
 * É montada sempre que a aba é aberta, então os números refletem as
 * partidas concluídas até aquele momento.
 */
export default function OverviewStats({ rooms, questions, onOpenReport }: OverviewStatsProps) {
    const { stats, hasData } = useOverviewViewModel(rooms, questions);

    if (!hasData) {
        return (
            <section className="overview-stats overview-stats--empty" aria-labelledby="overview-stats-title">
                <h2 id="overview-stats-title" className="overview-stats__title">
                    Estatísticas dos quizzes
                </h2>
                <p className="report-empty">
                    Nenhum quiz foi realizado ainda. Crie uma sala, mostre o código para a turma e os resultados
                    aparecerão aqui.
                </p>
            </section>
        );
    }

    return (
        <section className="overview-stats" aria-labelledby="overview-stats-title">
            <h2 id="overview-stats-title" className="overview-stats__title">
                Estatísticas dos quizzes
            </h2>

            <ul className="overview-stats__numbers">
                <li>
                    <span className="overview-stats__value">{stats.quizzesPlayed}</span>
                    <span className="overview-stats__label">Quizzes realizados</span>
                </li>
                <li>
                    <span className="overview-stats__value">{stats.studentParticipations}</span>
                    <span className="overview-stats__label">Participações de alunos</span>
                </li>
                <li>
                    <span className="overview-stats__value">{formatRate(stats.averageCorrectRate)}</span>
                    <span className="overview-stats__label">Acerto médio geral</span>
                </li>
            </ul>

            <div className="report-grid">
                <section className="report-card overview-stats__rooms" aria-labelledby="overview-rooms-title">
                    <h3 id="overview-rooms-title" className="report-section__title">
                        Desempenho por sala
                    </h3>
                    <ul className="report-list">
                        {stats.rooms.map((summary) => {
                            const room = rooms.find((item) => item.id === summary.roomId);
                            return (
                                <li key={summary.roomId} className="report-list__item">
                                    <div className="overview-stats__room-header">
                                        <span className="report-list__text">{summary.roomName}</span>
                                        {room && (
                                            <button
                                                type="button"
                                                className="overview-stats__link"
                                                onClick={() => onOpenReport(room)}
                                            >
                                                Ver resultados
                                            </button>
                                        )}
                                    </div>
                                    <RateBar
                                        rate={summary.averageCorrectRate}
                                        detail={`${summary.realStudentCount} ${summary.realStudentCount === 1 ? 'aluno' : 'alunos'}${summary.isFinished ? '' : ' · em andamento'}`}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </section>

                <div className="overview-stats__questions">
                    <QuestionList id="overview-hardest" title="Questões mais difíceis" rows={stats.hardestQuestions} />
                    <QuestionList id="overview-easiest" title="Questões mais fáceis" rows={stats.easiestQuestions} />
                </div>
            </div>

            <p className="report-note">
                Os números incluem os jogadores simulados da demonstração.
            </p>
        </section>
    );
}

function QuestionList({ id, title, rows }: { id: string; title: string; rows: QuestionReportRow[] }) {
    return (
        <section className="report-card" aria-labelledby={id}>
            <h3 id={id} className="report-section__title">
                {title}
            </h3>
            <ol className="report-list">
                {rows.map((row) => (
                    <li key={row.questionId} className="report-list__item">
                        <span className="report-list__text">{row.statement}</span>
                        <RateBar rate={row.correctRate} detail={`${row.correctCount} de ${row.answeredCount}`} />
                    </li>
                ))}
            </ol>
        </section>
    );
}
