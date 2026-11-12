import type { FormEvent } from 'react';
import Button from '../../../components/ui/Button/Button';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { NICKNAME_MAX_LENGTH } from '../../../models/game';

interface NicknameStepProps {
    nickname: string;
    error: string | null;
    onNicknameChange: (nickname: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function NicknameStep({ nickname, error, onNicknameChange, onSubmit }: NicknameStepProps) {
    // Em etapas com formulário o foco vai direto para o campo, para o
    // aluno já poder digitar.
    const inputRef = useFocusOnMount<HTMLInputElement>();

    return (
        <section className="play-card" aria-labelledby="play-nickname-title">
            <h1 id="play-nickname-title" className="play-card__title">
                Como você quer ser chamado?
            </h1>
            <p className="play-card__text">Seu apelido aparece para o professor e para a turma.</p>

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
                />

                {error && (
                    <p id="play-nickname-error" className="play-form__error" role="alert">
                        {error}
                    </p>
                )}

                <Button type="submit" size="lg" fullWidth>
                    Entrar na sala
                </Button>
            </form>
        </section>
    );
}
