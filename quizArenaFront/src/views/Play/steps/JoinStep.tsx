import type { FormEvent } from 'react';
import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { normalizeRoomCodeInput, PIN_LENGTH } from '../../../models/game';

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
        <section className="play-card play-card--entry" aria-labelledby="play-join-title">
            <div className="play-card__eyebrow">
                <Badge variant="primary">Arena ao vivo</Badge>
                <span className="play-card__step">Passo 1 de 2</span>
            </div>

            <h1 id="play-join-title" className="play-card__title">
                Entrar em uma sala
            </h1>
            <p className="play-card__text">
                Digite o código de 6 caracteres exibido pelo anfitrião para entrar na partida.
            </p>

            <form className="play-form" onSubmit={onSubmit} noValidate>
                <div className="play-form__field">
                    <div className="play-form__label-row">
                        <label htmlFor="play-pin" className="play-form__label">
                            Código da sala
                        </label>
                        <span className="play-form__counter" aria-hidden="true">
                            {pin.length}/{PIN_LENGTH}
                        </span>
                    </div>
                    <input
                        ref={inputRef}
                        id="play-pin"
                        className="play-form__input play-form__input--pin"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={PIN_LENGTH}
                        placeholder="EX: A1B2C3"
                        value={pin}
                        disabled={isJoining}
                        onChange={(event) => onPinChange(normalizeRoomCodeInput(event.target.value))}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? 'play-join-error' : 'play-join-hint'}
                    />
                </div>

                {error && (
                    <div id="play-join-error">
                        <Alert variant="error">{error}</Alert>
                    </div>
                )}

                <Button type="submit" size="lg" fullWidth isLoading={isJoining}>
                    {isJoining ? 'Verificando sala…' : 'Continuar'}
                </Button>
            </form>

            <p id="play-join-hint" className="play-card__hint">
                Não é necessário criar conta. Basta informar o código da sala e escolher seu apelido.
            </p>
        </section>
    );
}
