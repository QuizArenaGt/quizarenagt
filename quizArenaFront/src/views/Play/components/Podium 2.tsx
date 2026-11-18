import type { RankingEntry } from '../../../models/game';

interface PodiumProps {
    /** Ranking completo, já ordenado; o pódio usa os três primeiros. */
    ranking: RankingEntry[];
}

/*
 * VIEW — pódio dos três primeiros colocados.
 * Visualmente a ordem é 2º · 1º · 3º (o primeiro no centro e mais alto),
 * mas no HTML a lista segue a ordem real (1º, 2º, 3º) para que leitores de
 * tela anunciem as posições corretamente; o reposicionamento é feito com
 * CSS (order).
 */
export default function Podium({ ranking }: PodiumProps) {
    const topThree = ranking.slice(0, 3);

    return (
        <ol className="play-podium" aria-label="Pódio">
            {topThree.map((entry) => (
                <li
                    key={`${entry.position}-${entry.nickname}`}
                    className={`play-podium__place play-podium__place--${entry.position}${entry.isCurrentPlayer ? ' is-current' : ''}`}
                >
                    <span className="play-podium__avatar" aria-hidden="true">
                        {entry.nickname.charAt(0).toUpperCase()}
                    </span>
                    <span className="play-podium__name">
                        {entry.nickname}
                        {entry.isCurrentPlayer && <span className="play-podium__you">você</span>}
                    </span>
                    <span className="play-podium__score">{entry.score} pts</span>
                    <span className="play-podium__block">
                        <span className="sr-only">Posição </span>
                        {entry.position}º
                    </span>
                </li>
            ))}
        </ol>
    );
}
