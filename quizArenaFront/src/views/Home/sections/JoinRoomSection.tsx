import { useState, type FormEvent } from 'react';
import Button from '../../../components/ui/Button/Button';
import { normalizeRoomCodeInput } from '../../../models/game';

interface JoinRoomSectionProps {
    id: string;
    error?: string | null;
    isChecking?: boolean;
    onClearError?: () => void;
    onJoinRoom: (pin: string) => void | Promise<void>;
}

/*
 * Entrada rápida em sala pela landing page.
 * O código digitado é repassado ao ViewModel, que valida a sala antes de levar o aluno para a
 * tela /jogar.
 */
export default function JoinRoomSection({
    id,
    error = null,
    isChecking = false,
    onClearError,
    onJoinRoom,
}: JoinRoomSectionProps) {
    const titleId = `${id}-titulo`;
    const hintId = `${id}-aviso`;
    const errorId = `${id}-erro`;
    const [pin, setPin] = useState('');

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void onJoinRoom(normalizeRoomCodeInput(pin));
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

                    <form
                        className="home-join__form"
                        aria-labelledby={titleId}
                        onSubmit={handleSubmit}
                        noValidate
                    >
                        <div className="home-join__fieldset">
                            <label htmlFor="room-pin" className="home-join__label">
                                Código da sala
                            </label>
                            <input
                                id="room-pin"
                                name="room-pin"
                                className="home-join__input"
                                type="text"
                                autoComplete="off"
                                placeholder="EX: A1B2C3"
                                value={pin}
                                disabled={isChecking}
                                onChange={(event) => {
                                    setPin(normalizeRoomCodeInput(event.target.value));
                                    onClearError?.();
                                }}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? errorId : hintId}
                            />
                            {error && (
                                <p id={errorId} className="home-join__error" role="alert">
                                    {error}
                                </p>
                            )}
                            <Button type="submit" size="lg" fullWidth disabled={isChecking}>
                                {isChecking ? 'Verificando sala…' : 'Entrar na sala'}
                            </Button>
                        </div>
                        <p id={hintId} className="home-join__hint">
                            Informe o código de 6 caracteres exibido pelo anfitrião da partida.
                        </p>
                    </form>
                </div>
            </div>
        </section>
    );
}
