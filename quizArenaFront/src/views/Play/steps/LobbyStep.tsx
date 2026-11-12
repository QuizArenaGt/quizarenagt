import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import type { GameRoom } from '../../../models/game';

interface LobbyStepProps {
    room: GameRoom;
    nickname: string;
    onStart: () => void;
}

export default function LobbyStep({ room, nickname, onStart }: LobbyStepProps) {
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
                    <Icon name="book" size={18} /> {room.questions.length} perguntas
                </li>
                <li>
                    <Icon name="bolt" size={18} /> {room.timePerQuestion} segundos cada
                </li>
            </ul>

            <div className="play-lobby__players">
                <p className="play-lobby__players-title">
                    {room.opponents.length + 1} jogadores na sala
                </p>
                <ul className="play-lobby__players-list">
                    <li className="is-current">{nickname} (você)</li>
                    {room.opponents.map((opponent) => (
                        <li key={opponent.nickname}>{opponent.nickname}</li>
                    ))}
                </ul>
                {room.isDemo && (
                    <p className="play-lobby__players-note">Os demais jogadores são simulados nesta demonstração.</p>
                )}
            </div>

            <p className="play-lobby__waiting">
                Aguardando o professor iniciar a partida
                <span className="play-lobby__dots" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                </span>
            </p>

            {room.isDemo && (
                <div className="play-lobby__demo">
                    <p>Nesta demonstração não há professor conduzindo a partida. Comece quando quiser.</p>
                    <Button size="lg" fullWidth onClick={onStart}>
                        Iniciar partida
                    </Button>
                </div>
            )}
        </section>
    );
}
