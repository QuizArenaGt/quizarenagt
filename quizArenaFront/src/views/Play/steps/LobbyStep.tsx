import Badge from '../../../components/ui/Badge/Badge';
import Icon from '../../../components/ui/Icon/Icon';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import type { GameRoom } from '../../../models/game';
import type { LobbyPlayerDto } from '../../../services/socket';
import type { PlayerSocketStatus } from '../../../viewmodels/usePlayViewModel';

interface LobbyStepProps {
    room: GameRoom;
    nickname: string;
    playerId: string | null;
    players: LobbyPlayerDto[];
    socketStatus?: PlayerSocketStatus;
}

export default function LobbyStep({
    room,
    nickname,
    playerId,
    players,
    socketStatus = 'connected',
}: LobbyStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();
    const hasEnoughPlayers = players.length >= 2;

    return (
        <section className="play-card play-card--wide play-lobby" aria-labelledby="play-lobby-title">
            <div className="play-lobby__hero">
                <span className="play-lobby__avatar" aria-hidden="true">
                    {nickname.charAt(0).toUpperCase()}
                </span>

                <div className="play-lobby__hero-text">
                    <div className="play-lobby__badges">
                        <Badge variant={socketStatus === 'reconnecting' ? 'warning' : 'success'}>
                            {socketStatus === 'reconnecting' ? 'Reconectando…' : 'Você está na sala'}
                        </Badge>
                        <Badge variant="neutral">Código {room.pin}</Badge>
                    </div>

                    <h1 id="play-lobby-title" ref={titleRef} tabIndex={-1} className="play-card__title">
                        {room.title}
                    </h1>
                    <p className="play-card__text">
                        Participando como <strong>{nickname}</strong>
                    </p>
                </div>
            </div>

            <ul className="play-lobby__facts" aria-label="Configurações da partida">
                <li>
                    <Icon name="timer" size={16} />
                    <span>{room.timePerQuestion}s por pergunta</span>
                </li>
                <li>
                    <Icon name="users" size={16} />
                    <span>
                        {players.length} {players.length === 1 ? 'jogador conectado' : 'jogadores conectados'}
                    </span>
                </li>
            </ul>

            <div className="play-lobby__players">
                <div className="play-lobby__players-head">
                    <h2 className="play-lobby__players-title">Jogadores no lobby</h2>
                    <span className="play-lobby__players-hint">
                        {hasEnoughPlayers
                            ? 'Pronto para começar'
                            : 'Aguardando mais participantes'}
                    </span>
                </div>

                <ul className="play-lobby__players-list">
                    {players.map((player) => {
                        const isMe = playerId ? player.id === playerId : player.nickname === nickname;
                        return (
                            <li key={player.id} className={isMe ? 'is-current' : undefined}>
                                <span className="play-lobby__player-dot" aria-hidden="true">
                                    {player.nickname.charAt(0).toUpperCase()}
                                </span>
                                <span className="play-lobby__player-name">{player.nickname}</span>
                                {isMe && <span className="play-lobby__you-tag">você</span>}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="play-lobby__waiting-banner" role="status" aria-live="polite">
                <span className="play-lobby__pulse" aria-hidden="true" />
                <p className="play-lobby__waiting">
                    Aguardando o anfitrião iniciar a partida
                    <span className="play-lobby__dots" aria-hidden="true">
                        <span>.</span>
                        <span>.</span>
                        <span>.</span>
                    </span>
                </p>
            </div>
        </section>
    );
}
