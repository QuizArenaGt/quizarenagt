import Icon from '../../../components/ui/Icon/Icon';

/*
 * Composição visual do Hero, feita só com HTML/CSS (sem imagens).
 * Representa uma pergunta em andamento e um ranking. É decorativa
 * (aria-hidden): os dados exibidos são fictícios e não vêm do sistema.
 */
const OPTIONS = [
    { letter: 'A', text: 'Vênus', tone: 'primary' },
    { letter: 'B', text: 'Marte', tone: 'accent', correct: true },
    { letter: 'C', text: 'Júpiter', tone: 'highlight' },
    { letter: 'D', text: 'Saturno', tone: 'neutral' },
] as const;

const RANKING = [
    { name: 'Ana', points: 980 },
    { name: 'Léo', points: 920 },
    { name: 'Bia', points: 870 },
];

export default function HeroIllustration() {
    return (
        <div className="home-illustration" aria-hidden="true">
            <div className="home-illustration__glow" />

            <div className="home-illustration__question">
                <div className="home-illustration__question-top">
                    <span className="home-illustration__counter">Pergunta 3 de 10</span>
                    <span className="home-illustration__timer">12s</span>
                </div>
                <p className="home-illustration__statement">Qual planeta é conhecido como planeta vermelho?</p>
                <ul className="home-illustration__options">
                    {OPTIONS.map((option) => (
                        <li
                            key={option.letter}
                            className={`home-illustration__option${'correct' in option ? ' home-illustration__option--correct' : ''}`}
                        >
                            <span className={`home-illustration__letter home-illustration__letter--${option.tone}`}>
                                {option.letter}
                            </span>
                            {option.text}
                            {'correct' in option && <Icon name="check" size={18} className="home-illustration__check" />}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="home-illustration__ranking">
                <p className="home-illustration__ranking-title">
                    <Icon name="trophy" size={16} /> Ranking
                </p>
                <ol>
                    {RANKING.map((player, index) => (
                        <li key={player.name}>
                            <span className="home-illustration__position">{index + 1}</span>
                            <span className="home-illustration__player">{player.name}</span>
                            <span className="home-illustration__points">{player.points}</span>
                        </li>
                    ))}
                </ol>
            </div>

            <div className="home-illustration__players">
                <Icon name="users" size={18} />
                28 jogando
            </div>
        </div>
    );
}
