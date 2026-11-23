import type { FormEvent } from 'react';
import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '../../../models/game';

interface NicknameStepProps {
    pin?: string;
    nickname: string;
    error: string | null;
    isJoining?: boolean;
    onNicknameChange: (nickname: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function NicknameStep({
    pin = '',
    nickname,
    error,
    isJoining = false,
    onNicknameChange,
    onSubmit,
}: NicknameStepProps) {
    const inputRef = useFocusOnMount<HTMLInputElement>();
    const previewInitial = nickname.trim().charAt(0).toUpperCase() || '?';

    return (
        <section className="play-card play-card--entry" aria-labelledby="play-nickname-title">
            <div className="play-card__eyebrow">
                {pin ? <Badge variant="info">Sala {pin}</Badge> : <Badge variant="primary">Identificação</Badge>}
                <span className="play-card__step">Passo 2 de 2</span>
            </div>

            <div className="play-nickname__preview" aria-hidden="true">
                <span className="play-lobby__avatar play-lobby__avatar--sm">{previewInitial}</span>
            </div>

            <h1 id="play-nickname-title" className="play-card__title">
                Escolha seu apelido
            </h1>
            <p className="play-card__text">
                É assim que seu nome aparecerá no lobby e no placar da arena.
            </p>

            <form className="play-form" onSubmit={onSubmit} noValidate>
                <div className="play-form__field">
                    <div className="play-form__label-row">
                        <label htmlFor="play-nickname" className="play-form__label">
                            Apelido
                        </label>
                        <span className="play-form__counter" aria-hidden="true">
                            {nickname.length}/{NICKNAME_MAX_LENGTH}
                        </span>
                    </div>
                    <input
                        ref={inputRef}
                        id="play-nickname"
                        className="play-form__input"
                        type="text"
                        autoComplete="nickname"
                        placeholder="Ex.: Jogador01"
                        maxLength={NICKNAME_MAX_LENGTH}
                        value={nickname}
                        onChange={(event) => onNicknameChange(event.target.value)}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? 'play-nickname-error' : 'play-nickname-hint'}
                        disabled={isJoining}
                    />
                </div>

                {error && (
                    <div id="play-nickname-error">
                        <Alert variant="error">{error}</Alert>
                    </div>
                )}

                <Button type="submit" size="lg" fullWidth isLoading={isJoining}>
                    {isJoining ? 'Entrando na sala…' : 'Entrar na sala'}
                </Button>
            </form>

            <p id="play-nickname-hint" className="play-card__hint">
                Use entre {NICKNAME_MIN_LENGTH} e {NICKNAME_MAX_LENGTH} caracteres.
            </p>
        </section>
    );
}
