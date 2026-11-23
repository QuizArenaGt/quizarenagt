import { PlayerAvatar } from '../../../components/ui/PlayerAvatar/PlayerAvatar';
import type { RankingEntry } from '../../../models/game';

interface RankingListProps {
    entries: RankingEntry[];
    /**
     * Quantidade de posições exibidas. Se o aluno atual ficar fora desse
     * corte, a linha dele é mostrada ao final, separada por reticências.
     */
    limit?: number;
}

/** VIEW — lista de classificação, destacando o participante atual. */
export default function RankingList({ entries, limit = entries.length }: RankingListProps) {
    const visible = entries.slice(0, limit);
    const currentPlayer = entries.find((entry) => entry.isCurrentPlayer);
    const showCurrentSeparately = currentPlayer !== undefined && currentPlayer.position > limit;

    return (
        <ol className="play-ranking">
            {visible.map((entry) => (
                <RankingRow key={`${entry.position}-${entry.nickname}`} entry={entry} />
            ))}
            {showCurrentSeparately && (
                <>
                    <li className="play-ranking__gap" aria-hidden="true">
                        …
                    </li>
                    <RankingRow entry={currentPlayer} />
                </>
            )}
        </ol>
    );
}

function RankingRow({ entry }: { entry: RankingEntry }) {
    return (
        <li
            className={`play-ranking__row${entry.isCurrentPlayer ? ' is-current' : ''}`}
            aria-current={entry.isCurrentPlayer ? 'true' : undefined}
        >
            <span className={`play-ranking__position play-ranking__position--${Math.min(entry.position, 4)}`}>
                {entry.position}º
            </span>
            <PlayerAvatar
                avatarId={entry.avatarId}
                nickname={entry.nickname}
                size="sm"
                decorative
            />
            <span className="play-ranking__name">
                <span className="play-ranking__name-text">{entry.nickname}</span>
                {entry.isCurrentPlayer && <span className="play-ranking__you">você</span>}
            </span>
            <span className={`play-ranking__score${entry.score < 0 ? ' is-negative' : ''}`}>
                {entry.score} pts
            </span>
        </li>
    );
}
