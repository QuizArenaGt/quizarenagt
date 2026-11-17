import type { FormEvent } from 'react';
import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import Modal from '../../../components/ui/Modal/Modal';
import {
    NAME_MAX_LENGTH,
    formatPhone,
    getInitials,
    type License,
    type ProfileErrors,
    type ProfileField,
    type UserProfile,
} from '../../../models/profile';
import './ProfileModal.css';

interface ProfileModalProps {
    isOpen: boolean;
    profile: UserProfile | null;
    roleLabel: string;
    license: License;
    draft: Pick<UserProfile, 'name' | 'email' | 'phone'>;
    errors: ProfileErrors;
    isSaving: boolean;
    savedMessage: string | null;
    onFieldChange: (field: ProfileField, value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
}

/** VIEW — edição do perfil e situação da licença do usuário logado. */
export default function ProfileModal({
    isOpen,
    profile,
    roleLabel,
    license,
    draft,
    errors,
    isSaving,
    savedMessage,
    onFieldChange,
    onSubmit,
    onClose,
}: ProfileModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Meu perfil" size="lg">
            {profile && (
                <div className="profile">
                    <div className="profile__identity">
                        <span className="profile__avatar" aria-hidden="true">
                            {getInitials(profile.name)}
                        </span>
                        <div>
                            <p className="profile__name">{profile.name}</p>
                            <p className="profile__role">{roleLabel}</p>
                        </div>
                    </div>

                    <form className="profile__form" onSubmit={onSubmit} noValidate>
                        <ProfileInput
                            field="name"
                            label="Nome"
                            value={draft.name}
                            error={errors.name}
                            autoComplete="name"
                            maxLength={NAME_MAX_LENGTH}
                            onChange={onFieldChange}
                        />
                        <ProfileInput
                            field="email"
                            label="E-mail"
                            type="email"
                            value={draft.email}
                            error={errors.email}
                            autoComplete="email"
                            onChange={onFieldChange}
                        />
                        <ProfileInput
                            field="phone"
                            label="Telefone"
                            hint="opcional"
                            type="tel"
                            inputMode="tel"
                            placeholder="(00) 00000-0000"
                            value={formatPhone(draft.phone)}
                            error={errors.phone}
                            autoComplete="tel"
                            onChange={onFieldChange}
                        />

                        {savedMessage && (
                            <p className="profile__success" role="status">
                                <Icon name="check" size={18} /> {savedMessage}
                            </p>
                        )}

                        <p className="profile__note">
                            Por enquanto, as alterações ficam salvas apenas neste navegador. Ao entrar novamente,
                            nome e e-mail voltam aos dados cadastrados no servidor.
                        </p>

                        <div className="profile__actions">
                            <Button variant="secondary" onClick={onClose}>
                                Fechar
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? 'Salvando…' : 'Salvar alterações'}
                            </Button>
                        </div>
                    </form>

                    <section className="profile__license" aria-labelledby="profile-license-title">
                        <div className="profile__license-header">
                            <h3 id="profile-license-title" className="profile__section-title">
                                Licença
                            </h3>
                            <span
                                className={`profile__license-status${license.isActive ? ' is-active' : ''}`}
                            >
                                {license.isActive ? 'Ativa' : 'Inativa'}
                            </span>
                        </div>
                        <p className="profile__plan">{license.planName}</p>
                        <p className="profile__plan-description">{license.description}</p>
                        {license.isDemo && (
                            <p className="profile__demo">
                                Dados de demonstração: o sistema ainda não possui planos e licenças reais.
                            </p>
                        )}
                    </section>
                </div>
            )}
        </Modal>
    );
}

interface ProfileInputProps {
    field: ProfileField;
    label: string;
    value: string;
    error?: string;
    hint?: string;
    type?: string;
    inputMode?: 'tel' | 'email' | 'text';
    placeholder?: string;
    autoComplete?: string;
    maxLength?: number;
    onChange: (field: ProfileField, value: string) => void;
}

function ProfileInput({ field, label, value, error, hint, onChange, ...inputProps }: ProfileInputProps) {
    const id = `profile-${field}`;
    const errorId = `${id}-error`;

    return (
        <div className="profile__field">
            <label htmlFor={id} className="profile__label">
                {label} {hint && <span className="profile__hint">({hint})</span>}
            </label>
            <input
                id={id}
                className="profile__input"
                value={value}
                onChange={(event) => onChange(field, event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                {...inputProps}
            />
            {error && (
                <p id={errorId} className="profile__error">
                    {error}
                </p>
            )}
        </div>
    );
}
