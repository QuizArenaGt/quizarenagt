import Button from '../../../components/ui/Button/Button';
import Modal from '../../../components/ui/Modal/Modal';
import type { Room } from '../../../models/room';
import { formatRate, type QuestionReportRow, type RoomReport, type StudentReportRow } from '../../../models/roomReport';
import RateBar from '../components/RateBar';
import '../reports.css';

interface RoomReportModalProps {
    view: { room: Room; report: RoomReport | null } | null;
    onClose: () => void;
}

/**
 * VIEW — relatório de uma sala finalizada: ranking, perguntas mais
 * acertadas e mais erradas, e alunos com mais acertos e mais erros.
 * Todos os números chegam prontos do Model (buildRoomReport).
 */
export default function RoomReportModal({ view, onClose }: RoomReportModalProps) {
    return (
        <Modal
            isOpen={view !== null}
            onClose={onClose}
            size="lg"
            title={view ? `Resultados — ${view.room.name}` : ''}
            description={view?.report ? undefined : 'Nenhum aluno concluiu esta sala ainda.'}
        >
            {view?.report ? (
                <ReportContent report={view.report} />
            ) : (
                <p className="report-empty">
                    Quando os alunos terminarem a partida pelo código da sala, os resultados aparecerão aqui.
                </p>
            )}
            <div className="report-actions">
                <Button onClick={onClose}>Fechar</Button>
            </div>
        </Modal>
    );
}

function ReportContent({ report }: { report: RoomReport }) {
    return (
        <div className="report">
            <ul className="report-summary">
                <li>
                    <strong>{report.participantCount}</strong> participantes
                </li>
                <li>
                    <strong>{report.questionCount}</strong> perguntas
                </li>
                <li>
                    <strong>{formatRate(report.averageCorrectRate)}</strong> de acerto médio
                </li>
            </ul>

            <section aria-labelledby="report-ranking-title">
                <h3 id="report-ranking-title" className="report-section__title">
                    Ranking
                </h3>
                <div className="report-table-wrapper">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th scope="col">Posição</th>
                                <th scope="col">Aluno</th>
                                <th scope="col">Pontos</th>
                                <th scope="col">Acertos</th>
                                <th scope="col">Erros</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.ranking.map((row) => (
                                <tr key={`${row.position}-${row.nickname}`}>
                                    <td>
                                        <span className={`report-position report-position--${Math.min(row.position, 4)}`}>
                                            {row.position}º
                                        </span>
                                    </td>
                                    <td>
                                        <StudentName row={row} />
                                    </td>
                                    <td>{row.score}</td>
                                    <td>{row.correctCount}</td>
                                    <td>{row.wrongCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="report-grid">
                <QuestionHighlight
                    id="report-best-questions"
                    title="Questões mais acertadas"
                    rows={report.mostCorrectQuestions}
                />
                <QuestionHighlight
                    id="report-worst-questions"
                    title="Questões mais erradas"
                    rows={report.mostMissedQuestions}
                />
                <StudentHighlight
                    id="report-best-students"
                    title="Alunos com mais acertos"
                    rows={report.studentsWithMostCorrect}
                    metric={(row) => `${row.correctCount} ${row.correctCount === 1 ? 'acerto' : 'acertos'}`}
                />
                <StudentHighlight
                    id="report-worst-students"
                    title="Alunos com mais erros"
                    rows={report.studentsWithMostWrong}
                    metric={(row) => `${row.wrongCount} ${row.wrongCount === 1 ? 'erro' : 'erros'}`}
                    emptyText="Ninguém errou nesta sala."
                />
            </div>

            {report.participantCount > report.realStudentCount && (
                <p className="report-note">
                    Alunos marcados como "simulado" completam a turma nesta demonstração; com o backend,
                    aparecerão apenas os alunos reais.
                </p>
            )}
        </div>
    );
}

function StudentName({ row }: { row: StudentReportRow }) {
    return (
        <>
            {row.nickname}
            {row.isSimulated && <span className="report-simulated">simulado</span>}
        </>
    );
}

function QuestionHighlight({ id, title, rows }: { id: string; title: string; rows: QuestionReportRow[] }) {
    return (
        <section className="report-card" aria-labelledby={id}>
            <h3 id={id} className="report-section__title">
                {title}
            </h3>
            <ol className="report-list">
                {rows.map((row) => (
                    <li key={row.questionId} className="report-list__item">
                        <span className="report-list__text">{row.statement}</span>
                        <RateBar
                            rate={row.correctRate}
                            detail={`${row.correctCount} de ${row.answeredCount} acertaram`}
                        />
                    </li>
                ))}
            </ol>
        </section>
    );
}

interface StudentHighlightProps {
    id: string;
    title: string;
    rows: StudentReportRow[];
    metric: (row: StudentReportRow) => string;
    emptyText?: string;
}

function StudentHighlight({ id, title, rows, metric, emptyText }: StudentHighlightProps) {
    return (
        <section className="report-card" aria-labelledby={id}>
            <h3 id={id} className="report-section__title">
                {title}
            </h3>
            {rows.length === 0 ? (
                <p className="report-empty">{emptyText}</p>
            ) : (
                <ol className="report-list">
                    {rows.map((row) => (
                        <li key={`${row.position}-${row.nickname}`} className="report-list__item report-list__item--row">
                            <span className="report-list__text">
                                <StudentName row={row} />
                            </span>
                            <span className="report-list__metric">{metric(row)}</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
