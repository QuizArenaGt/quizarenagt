import Badge, { type BadgeVariant } from '../../../components/ui/Badge/Badge';
import {
    MIN_ROOM_PLAYERS,
    MIN_ROOM_QUESTIONS,
    type Room,
} from '../../../models/room';

interface RoomOverviewStatusBarProps {
    room: Room;
    canStart: boolean;
    activePlayersCount: number;
    activeQuestionsCount: number;
    activeRoundNumber: number | null;
    closedRoundNumber: number | null;
    answeredCount: number;
    gamesCount: number;
}

interface StatusMetricItem {
    label: string;
    value: string;
    hint?: string;
}

/** Faixa de leitura rápida do estado operacional da sala na aba Visão Geral. */
export default function RoomOverviewStatusBar({
    room,
    canStart,
    activePlayersCount,
    activeQuestionsCount,
    activeRoundNumber,
    closedRoundNumber,
    answeredCount,
    gamesCount,
}: RoomOverviewStatusBarProps) {
    let badgeVariant: BadgeVariant;
    let badgeLabel: string;
    let headline: string;
    let metrics: StatusMetricItem[];

    if (room.backendStatus === 'WAITING') {
        badgeVariant = canStart ? 'success' : 'warning';
        badgeLabel = canStart ? 'Pronta para iniciar' : 'Aguardando requisitos';
        headline = canStart
            ? 'Os requisitos mínimos foram atendidos. Você já pode iniciar a partida.'
            : 'Complete as perguntas e aguarde os jogadores entrarem para iniciar.';
        metrics = [
            {
                label: 'Jogadores na sala',
                value: `${activePlayersCount}`,
                hint: `mín. ${MIN_ROOM_PLAYERS} · máx. ${room.maxPlayers}`,
            },
            {
                label: 'Perguntas ativas',
                value: `${activeQuestionsCount}`,
                hint: `mín. ${MIN_ROOM_QUESTIONS}`,
            },
        ];
    } else if (room.backendStatus === 'IN_PROGRESS') {
        const currentRound = activeRoundNumber ?? closedRoundNumber;
        const roundText = currentRound
            ? activeQuestionsCount > 0
                ? `${currentRound} de ${questionLabel(activeQuestionsCount)}`
                : `#${currentRound}`
            : 'Aguardando';

        badgeVariant = activeRoundNumber ? 'success' : 'info';
        badgeLabel = activeRoundNumber
            ? 'Rodada em andamento'
            : closedRoundNumber
              ? 'Entre rodadas'
              : 'Partida iniciada';
        headline = activeRoundNumber
            ? 'Acompanhe as respostas recebidas ou encerre a rodada manualmente quando desejar.'
            : closedRoundNumber
              ? 'Rodada concluída. Avance para abrir a próxima pergunta ou finalizar a partida.'
              : 'Partida iniciada. Abra a primeira rodada para liberar a pergunta aos jogadores.';
        metrics = [
            {
                label: 'Rodada atual',
                value: roundText,
            },
            {
                label: 'Participantes ativos',
                value: `${activePlayersCount}`,
                hint: `máx. ${room.maxPlayers}`,
            },
            ...(activeRoundNumber
                ? [
                      {
                          label: 'Respostas na rodada',
                          value: `${answeredCount} / ${activePlayersCount}`,
                      },
                  ]
                : []),
        ];
    } else if (room.backendStatus === 'CANCELLED') {
        badgeVariant = 'warning';
        badgeLabel = 'Partida cancelada';
        headline = 'A partida foi encerrada automaticamente por falta de participantes ativos.';
        metrics = [
            { label: 'Participantes', value: `${room.players.length}` },
            { label: 'Partidas na sala', value: `${gamesCount}` },
        ];
    } else {
        badgeVariant = 'neutral';
        badgeLabel = 'Partida finalizada';
        headline = 'Resultados consolidados. Consulte o relatório ou inicie uma nova partida.';
        metrics = [
            { label: 'Participantes', value: `${room.players.length}` },
            { label: 'Partidas na sala', value: `${gamesCount}` },
        ];
    }

    return (
        <section className="room-status-banner" aria-label="Estado atual da sala">
            <div className="room-status-banner__summary">
                <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                <p className="room-status-banner__headline">{headline}</p>
            </div>
            <ul className="room-status-banner__metrics">
                {metrics.map((item) => (
                    <li key={item.label} className="room-status-metric">
                        <span className="room-status-metric__label">{item.label}</span>
                        <strong className="room-status-metric__value">{item.value}</strong>
                        {item.hint && <span className="room-status-metric__hint">{item.hint}</span>}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function questionLabel(count: number): string {
    return `${count} ${count === 1 ? 'questão' : 'questões'}`;
}
