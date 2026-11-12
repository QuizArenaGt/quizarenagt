import type { FormEvent } from 'react';
import Button from '../../../components/ui/Button/Button';
import { DEMO_ROOM_PIN, PIN_LENGTH } from '../../../models/game';

interface JoinRoomSectionProps {
    id: string;
    onJoinRoom: (pin: string) => void;
}

/*
 * Entrada rápida em sala pela landing page.
 * O código digitado é repassado ao ViewModel, que leva o aluno para a
 * tela /jogar. Enquanto o backend não possui salas, apenas a sala de
 * demonstração (123456) existe, e isso é informado ao usuário.
 */
export default function JoinRoomSection({ id, onJoinRoom }: JoinRoomSectionProps) {
    const titleId = `${id}-titulo`;
    const hintId = `${id}-aviso`;

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const pin = new FormData(event.currentTarget).get('room-pin');
        onJoinRoom(typeof pin === 'string' ? pin : '');
    }

    return (
        <section id={id} className="home-section" aria-labelledby={titleId}>
            <div className="container">
                <div className="home-join">
                    <div className="home-join__content">
                        <span className="home-join__tag">Para alunos</span>
                        <h2 id={titleId} className="home-join__title">
                            Entrar em uma sala
                        </h2>
                        <p className="home-join__text">
                            Digite o código informado pelo professor e escolha um apelido. Não é preciso
                            criar conta para jogar.
                        </p>
                    </div>

                    <form className="home-join__form" aria-labelledby={titleId} onSubmit={handleSubmit}>
                        <div className="home-join__fieldset">
                            <label htmlFor="room-pin" className="home-join__label">
                                Código da sala
                            </label>
                            <input
                                id="room-pin"
                                name="room-pin"
                                className="home-join__input"
                                inputMode="numeric"
                                autoComplete="off"
                                maxLength={PIN_LENGTH}
                                placeholder="000000"
                                aria-describedby={hintId}
                            />
                            <Button type="submit" size="lg" fullWidth>
                                Entrar na sala
                            </Button>
                        </div>
                        <p id={hintId} className="home-join__hint">
                            Modo de demonstração: use o código <strong>{DEMO_ROOM_PIN}</strong>.
                        </p>
                    </form>
                </div>
            </div>
        </section>
    );
}
