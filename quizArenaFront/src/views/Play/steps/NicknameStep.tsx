import type { FormEvent } from 'react';
import Button from '../../../components/ui/Button/Button';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { NICKNAME_MAX_LENGTH } from '../../../models/game';

interface NicknameStepProps {
    nickname: string;
    error: string | null;
    isJoining?: boolean;
    onNicknameChange: (nickname: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function NicknameStep({
    nickname,
    error,
    isJoining = false,
    onNicknameChange,
    onSubmit,
}: NicknameStepProps) {
    const inputRef = useFocusOnMount<HTMLInputElement>();

    return (
        <section className="play-card" aria-labelledby="play-nickname-title">
            <h1 id="play-nickname-title" className="play-card__title">
                Como você quer ser chamado?
            </h1>
            <p className="play-card__text">Seu apelido aparece para o anfitrião e para os participantes.</p>

            <form className="play-form" onSubmit={onSubmit} noValidate>
                <label htmlFor="play-nickname" className="sr-only">
                    Apelido
                </label>
                <input
                    ref={inputRef}
                    id="play-nickname"
                    className="play-form__input"
                    autoComplete="nickname"
                    placeholder="Seu apelido"
                    maxLength={NICKNAME_MAX_LENGTH}
                    value={nickname}
                    onChange={(event) => onNicknameChange(event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'play-nickname-error' : undefined}
                    disabled={isJoining}
                />

                {error && (
                    <p id="play-nickname-error" className="play-form__error" role="alert">
                        {error}
                    </p>
                )}

                <Button type="submit" size="lg" fullWidth disabled={isJoining}>
                    {isJoining ? 'Entrando na sala…' : 'Entrar na sala'}
                </Button>
            </form>
        </section>
    );
}
