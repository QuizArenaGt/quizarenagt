import Badge from '../../../components/ui/Badge/Badge';
import Icon from '../../../components/ui/Icon/Icon';
import { getInitials } from '../../../models/profile';
import { MIN_ROOM_PLAYERS } from '../../../models/room';
import type { BackendRoomStatus, LobbyPlayerDto } from '../../../services/socket';

interface RoomPlayersCardProps {
    players: LobbyPlayerDto[];
    maxPlayers: number;
    activePlayersCount: number;
    roomStatus: BackendRoomStatus;
    answeredPlayerIds: readonly string[];
    hasOpenRound: boolean;
}

/** Lobby em tempo real (espera) ou placar ao vivo / final dos participantes da sala. */
export default function RoomPlayersCard({
    players,
    maxPlayers,
    activePlayersCount,
    roomStatus,
    answeredPlayerIds,
    hasOpenRound,
}: RoomPlayersCardProps) {
    const isWaiting = roomStatus === 'WAITING';
    const hasEnoughPlayers = activePlayersCount >= MIN_ROOM_PLAYERS;
    const missingPlayers = Math.max(0, MIN_ROOM_PLAYERS - activePlayersCount);
    const occupancyRatio = maxPlayers > 0 ? Math.min(100, Math.round((activePlayersCount / maxPlayers) * 100)) : 0;
    const answeredSet = new Set(answeredPlayerIds);
    const orderedPlayers = isWaiting
        ? players
        : [...players].sort((a, b) => b.score - a.score);

    const title = isWaiting
        ? 'Lobby de Jogadores'
        : roomStatus === 'IN_PROGRESS'
          ? 'Placar ao Vivo'
          : roomStatus === 'FINISHED'
            ? 'Classificação Final'
            : 'Participantes';

    const description = isWaiting
        ? 'Jogadores conectados aguardando o início da partida.'
        : roomStatus === 'IN_PROGRESS'
          ? 'Pontuação e respostas atualizadas em tempo real.'
          : 'Pontuação registrada para os participantes desta partida.';

    return (
        <section className="room-detail-card room-detail-card--surface" aria-labelledby="room-lobby-title">
            <div className="room-players-card__body">
                <div className="room-detail-card__head room-detail-card__head--split">
                    <div>
                        <h3 id="room-lobby-title">{title}</h3>
                        <p className="room-detail-card__desc">{description}</p>
                    </div>
                    <Badge variant={isWaiting ? (hasEnoughPlayers ? 'success' : 'warning') : 'primary'}>
                        {isWaiting
                            ? hasEnoughPlayers
                                ? 'Mínimo atingido'
                                : `Falta${missingPlayers === 1 ? '' : 'm'} ${missingPlayers} p/ iniciar`
                            : `${activePlayersCount} ${activePlayersCount === 1 ? 'ativo' : 'ativos'}`}
                    </Badge>
                </div>

                {isWaiting && (
                    <div className="room-players-capacity" aria-label="Lotação da sala">
                        <dl className="room-players-capacity__stats">
                            <div className="room-players-capacity__stat">
                                <dt>Na sala agora</dt>
                                <dd>{activePlayersCount}</dd>
                            </div>
                            <div className="room-players-capacity__stat">
                                <dt>Mínimo p/ iniciar</dt>
                                <dd>{MIN_ROOM_PLAYERS}</dd>
                            </div>
                            <div className="room-players-capacity__stat">
                                <dt>Limite máximo</dt>
                                <dd>{maxPlayers}</dd>
                            </div>
                        </dl>
                        <div className="room-players-capacity__track" aria-hidden="true">
                            <span
                                className={`room-players-capacity__fill${hasEnoughPlayers ? ' is-ready' : ''}`}
                                style={{ width: `${occupancyRatio}%` }}
                            />
                        </div>
                    </div>
                )}

                {orderedPlayers.length === 0 ? (
                    <div className="room-lobby-empty">
                        <span className="room-lobby-empty__icon" aria-hidden="true">
                            <Icon name="users" size={22} />
                        </span>
                        <div>
                            <p className="room-lobby-empty__title">Nenhum participante conectado ainda</p>
                            <p className="room-lobby-empty__desc">
                                Assim que os jogadores entrarem pela página <strong>/jogar</strong> usando o código acima,
                                eles aparecerão aqui automaticamente.
                            </p>
                        </div>
                    </div>
                ) : (
                    <ol className="room-players-list">
                        {orderedPlayers.map((player, index) => {
                            const hasAnswered = hasOpenRound && answeredSet.has(player.id);
                            return (
                                <li key={player.id} className="room-players-list__item">
                                    <div className="room-players-list__identity">
                                        {isWaiting ? (
                                            <span className="room-player-avatar" aria-hidden="true">
                                                {getInitials(player.nickname)}
                                            </span>
                                        ) : (
                                            <span className={`room-player-rank${index === 0 ? ' is-leader' : ''}`}>
                                                #{index + 1}
                                            </span>
                                        )}
                                        <div className="room-player-meta">
                                            <strong className="room-player-name">{player.nickname}</strong>
                                            <div className="room-player-badges">
                                                {player.status === 'LEFT' ? (
                                                    <Badge variant="neutral">Saiu</Badge>
                                                ) : player.status === 'ABANDONED' ? (
                                                    <Badge variant="warning">Abandonou</Badge>
                                                ) : isWaiting ? (
                                                    <Badge variant="success">Conectado</Badge>
                                                ) : null}
                                                {hasAnswered && player.status !== 'LEFT' && player.status !== 'ABANDONED' && (
                                                    <Badge variant="info">Respondeu</Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {!isWaiting && (
                                        <span className="room-players-list__score">
                                            {player.score} pts
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </section>
    );
}
