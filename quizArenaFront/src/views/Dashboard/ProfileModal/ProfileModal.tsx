import type { FormEvent } from 'react';
import InputPassword from '../../../components/Inputs/InputPassword/InputPassword';
import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import Modal from '../../../components/ui/Modal/Modal';
import PasswordRequirements from '../../../features/auth/components/PasswordRequirements/PasswordRequirements';
import type {
    AuthFieldErrors,
    ChangePasswordField,
} from '../../../features/auth/validation';
import {
    NAME_MAX_LENGTH,
    formatPhone,
    getInitials,
    type License,
    type ProfileErrors,
    type ProfileField,
    type UserProfile,
} from '../../../models/profile';
import type { ChangePasswordDraft } from '../../../viewmodels/useProfileViewModel';
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
    passwordDraft: ChangePasswordDraft;
    passwordFieldErrors: AuthFieldErrors<ChangePasswordField>;
    passwordError: string | null;
    passwordSuccess: string | null;
    isChangingPassword: boolean;
    onPasswordFieldChange: (field: ChangePasswordField, value: string) => void;
    onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
}

/** VIEW — edição do perfil, alteração de senha e situação da licença do usuário logado. */
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
    passwordDraft,
    passwordFieldErrors,
    passwordError,
    passwordSuccess,
    isChangingPassword,
    onPasswordFieldChange,
    onPasswordSubmit,
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
                        <h3 className="profile__section-title">Dados pessoais</h3>

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
                            <Alert variant="success">{savedMessage}</Alert>
                        )}

                        <p className="profile__note">
                            Por enquanto, as alterações ficam salvas apenas neste navegador. Ao entrar novamente,
                            nome e e-mail voltam aos dados cadastrados no servidor.
                        </p>

                        <div className="profile__actions">
                            <Button variant="secondary" onClick={onClose}>
                                Fechar
                            </Button>
                            <Button type="submit" isLoading={isSaving}>
                                {isSaving ? 'Salvando…' : 'Salvar alterações'}
                            </Button>
                        </div>
                    </form>

                    <section className="profile__security" aria-labelledby="profile-security-title">
                        <h3 id="profile-security-title" className="profile__section-title">
                            Alterar senha
                        </h3>
                        <p className="profile__security-subtitle">
                            Atualize sua senha de acesso informando a senha atual.
                        </p>

                        <form className="profile__password-form" onSubmit={onPasswordSubmit} noValidate>
                            <InputPassword
                                id="profile-current-password"
                                name="currentPassword"
                                label="Senha atual"
                                textPlaceholder="Senha atual"
                                password={passwordDraft.currentPassword}
                                setPassword={(value) => onPasswordFieldChange('currentPassword', value)}
                                autoComplete="current-password"
                                disabled={isChangingPassword}
                                error={passwordFieldErrors.currentPassword}
                            />

                            <InputPassword
                                id="profile-new-password"
                                name="newPassword"
                                label="Nova senha"
                                textPlaceholder="Mín. 8 caracteres (letras e números)"
                                password={passwordDraft.newPassword}
                                setPassword={(value) => onPasswordFieldChange('newPassword', value)}
                                autoComplete="new-password"
                                disabled={isChangingPassword}
                                error={passwordFieldErrors.newPassword}
                            />

                            <PasswordRequirements password={passwordDraft.newPassword} />

                            <InputPassword
                                id="profile-confirm-password"
                                name="confirmPassword"
                                label="Confirmar nova senha"
                                textPlaceholder="Repita a senha"
                                password={passwordDraft.confirmPassword}
                                setPassword={(value) => onPasswordFieldChange('confirmPassword', value)}
                                autoComplete="new-password"
                                disabled={isChangingPassword}
                                error={passwordFieldErrors.confirmPassword}
                            />

                            {passwordError && (
                                <Alert variant="error">{passwordError}</Alert>
                            )}

                            {passwordSuccess && (
                                <Alert variant="success">{passwordSuccess}</Alert>
                            )}

                            <div className="profile__actions">
                                <Button
                                    type="submit"
                                    isLoading={isChangingPassword}
                                    disabled={isChangingPassword}
                                >
                                    {isChangingPassword ? 'Alterando…' : 'Alterar senha'}
                                </Button>
                            </div>
                        </form>
                    </section>

                    <section className="profile__license" aria-labelledby="profile-license-title">
                        <div className="profile__license-header">
                            <h3 id="profile-license-title" className="profile__section-title">
                                Licença
                            </h3>
                            <Badge variant={license.isActive ? 'success' : 'danger'}>
                                {license.isActive ? 'Ativa' : 'Inativa'}
                            </Badge>
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
                <p id={errorId} className="profile__error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
