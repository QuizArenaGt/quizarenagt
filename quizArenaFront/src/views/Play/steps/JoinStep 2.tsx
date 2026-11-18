import type { FormEvent } from 'react';
import Button from '../../../components/ui/Button/Button';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { PIN_LENGTH } from '../../../models/game';

interface JoinStepProps {
    pin: string;
    error: string | null;
    isJoining: boolean;
    onPinChange: (pin: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function JoinStep({ pin, error, isJoining, onPinChange, onSubmit }: JoinStepProps) {
    // Em etapas com formulário o foco vai direto para o campo.
    const inputRef = useFocusOnMount<HTMLInputElement>();

    return (
        <section className="play-card" aria-labelledby="play-join-title">
            <h1 id="play-join-title" className="play-card__title">
                Entrar em uma sala
            </h1>
            <p className="play-card__text">Digite o código que o professor mostrou na tela.</p>

            <form className="play-form" onSubmit={onSubmit} noValidate>
                <label htmlFor="play-pin" className="sr-only">
                    Código da sala
                </label>
                <input
                    ref={inputRef}
                    id="play-pin"
                    className="play-form__input play-form__input--pin"
                    type="text"
                    autoComplete="off"
                    placeholder="EX: A1B2C3"
                    maxLength={PIN_LENGTH}
                    value={pin}
                    onChange={(event) => onPinChange(event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'play-join-error' : 'play-join-hint'}
                />

                {error && (
                    <p id="play-join-error" className="play-form__error" role="alert">
                        {error}
                    </p>
                )}

                <Button type="submit" size="lg" fullWidth disabled={isJoining}>
                    {isJoining ? 'Continuando…' : 'Continuar'}
                </Button>
            </form>

            <p id="play-join-hint" className="play-card__hint">
                Informe o código de 6 caracteres (letras e números) exibido pelo anfitrião.
            </p>
        </section>
    );
}
