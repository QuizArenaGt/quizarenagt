import Icon from '../../../components/ui/Icon/Icon';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import type { GameRoom } from '../../../models/game';
import type { LobbyPlayerDto } from '../../../services/socket';

interface LobbyStepProps {
    room: GameRoom;
    nickname: string;
    playerId: string | null;
    players: LobbyPlayerDto[];
}

export default function LobbyStep({ room, nickname, playerId, players }: LobbyStepProps) {
    const titleRef = useFocusOnMount<HTMLHeadingElement>();

    return (
        <section className="play-card play-card--center" aria-labelledby="play-lobby-title">
            <span className="play-lobby__avatar" aria-hidden="true">
                {nickname.charAt(0).toUpperCase()}
            </span>
            <h1 id="play-lobby-title" ref={titleRef} tabIndex={-1} className="play-card__title">
                Você está na sala, {nickname}!
            </h1>
            <p className="play-card__text">
                {room.title} · código <strong>{room.pin}</strong>
            </p>

            <ul className="play-lobby__facts">
                <li>
                    <Icon name="bolt" size={18} /> {room.timePerQuestion} segundos por pergunta
                </li>
            </ul>

            <div className="play-lobby__players">
                <p className="play-lobby__players-title">
                    {players.length} {players.length === 1 ? 'jogador na sala' : 'jogadores na sala'}
                </p>
                <ul className="play-lobby__players-list">
                    {players.map((player) => {
                        const isMe = playerId ? player.id === playerId : player.nickname === nickname;
                        return (
                            <li key={player.id} className={isMe ? 'is-current' : undefined}>
                                {player.nickname}
                                {isMe ? ' (você)' : ''}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <p className="play-lobby__waiting">
                Aguardando o anfitrião iniciar a partida
                <span className="play-lobby__dots" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                </span>
            </p>
        </section>
    );
}
