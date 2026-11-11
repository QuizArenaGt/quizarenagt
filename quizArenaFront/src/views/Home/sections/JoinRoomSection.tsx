import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';

interface JoinRoomSectionProps {
    id: string;
}

/*
 * Entrada em sala por código (PIN).
 * O backend ainda não possui salas, então o formulário é exibido
 * desabilitado e identificado como recurso previsto. Quando o endpoint
 * existir, a lógica deverá ir para um ViewModel próprio
 * (ex.: useJoinRoomViewModel) e um service de salas.
 */
export default function JoinRoomSection({ id }: JoinRoomSectionProps) {
    const titleId = `${id}-titulo`;
    const hintId = `${id}-aviso`;

    return (
        <section id={id} className="home-section" aria-labelledby={titleId}>
            <div className="container">
                <div className="home-join">
                    <div className="home-join__content">
                        <Badge status="planned" />
                        <h2 id={titleId} className="home-join__title">
                            Entrar em uma sala
                        </h2>
                        <p className="home-join__text">
                            Em breve, os alunos poderão entrar em uma partida digitando o código informado
                            pelo professor. Enquanto isso, crie sua conta para estar pronto quando as salas
                            ao vivo forem lançadas.
                        </p>
                        <Button to="/register" variant="secondary">
                            Criar minha conta
                        </Button>
                    </div>

                    <form className="home-join__form" aria-labelledby={titleId}>
                        <fieldset disabled aria-describedby={hintId} className="home-join__fieldset">
                            <label htmlFor="room-pin" className="home-join__label">
                                Código da sala
                            </label>
                            <input
                                id="room-pin"
                                name="room-pin"
                                className="home-join__input"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="000 000"
                            />
                            <Button type="submit" size="lg" fullWidth>
                                Entrar na sala
                            </Button>
                        </fieldset>
                        <p id={hintId} className="home-join__hint">
                            Recurso em desenvolvimento.
                        </p>
                    </form>
                </div>
            </div>
        </section>
    );
}
