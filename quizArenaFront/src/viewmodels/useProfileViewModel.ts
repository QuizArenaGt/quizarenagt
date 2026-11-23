import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { changePassword } from '../features/auth/services/authService';
import {
    formatAuthApiError,
    validateChangePasswordFields,
    type AuthFieldErrors,
    type ChangePasswordField,
} from '../features/auth/validation';
import {
    ROLE_LABEL,
    sanitizePhone,
    validateProfile,
    type ProfileErrors,
    type ProfileField,
    type UserProfile,
} from '../models/profile';
import { ApiError } from '../services/api';
import { getLicense, getProfile, updateProfile } from '../services/profileService';
import { notifyAuthTokenUpdated } from '../services/socket';

type ProfileDraft = Pick<UserProfile, 'name' | 'email' | 'phone'>;
export type ChangePasswordDraft = {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
};

const EMPTY_DRAFT: ProfileDraft = { name: '', email: '', phone: '' };
const EMPTY_PASSWORD_DRAFT: ChangePasswordDraft = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
};

/*
 * VIEWMODEL do perfil do usuário (aberto pelo nome no topo do painel).
 *
 * Expõe o usuário logado (usado também no cabeçalho), a licença, o
 * formulário de edição local e o fluxo autenticado de alteração de senha.
 */
export function useProfileViewModel() {
    const [profile, setProfile] = useState<UserProfile | null>(() => getProfile());
    const license = useMemo(() => getLicense(), []);

    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
    const [errors, setErrors] = useState<ProfileErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    const [passwordDraft, setPasswordDraft] =
        useState<ChangePasswordDraft>(EMPTY_PASSWORD_DRAFT);
    const [passwordFieldErrors, setPasswordFieldErrors] = useState<
        AuthFieldErrors<ChangePasswordField>
    >({});
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const resetPasswordState = useCallback(() => {
        setPasswordDraft(EMPTY_PASSWORD_DRAFT);
        setPasswordFieldErrors({});
        setPasswordError(null);
        setPasswordSuccess(null);
    }, []);

    const open = useCallback(() => {
        if (!profile) return;
        setDraft({ name: profile.name, email: profile.email, phone: profile.phone });
        setErrors({});
        setSavedMessage(null);
        resetPasswordState();
        setIsOpen(true);
    }, [profile, resetPasswordState]);

    const close = useCallback(() => {
        setIsOpen(false);
        resetPasswordState();
    }, [resetPasswordState]);

    function setField(field: ProfileField, value: string) {
        setDraft((current) => ({ ...current, [field]: field === 'phone' ? sanitizePhone(value) : value }));
        // Ao corrigir um campo, a mensagem de erro dele some.
        setErrors((current) => ({ ...current, [field]: undefined }));
        setSavedMessage(null);
    }

    function setPasswordField(field: ChangePasswordField, value: string) {
        setPasswordDraft((current) => ({ ...current, [field]: value }));
        setPasswordFieldErrors((current) => ({ ...current, [field]: undefined }));
        if (passwordError) setPasswordError(null);
        if (passwordSuccess) setPasswordSuccess(null);
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!profile) return;

        const cleaned: ProfileDraft = {
            name: draft.name.trim(),
            email: draft.email.trim(),
            phone: draft.phone,
        };
        const validationErrors = validateProfile(cleaned);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        setIsSaving(true);
        try {
            const updated = await updateProfile({ ...profile, ...cleaned });
            setProfile(updated);
            setDraft(cleaned);
            setSavedMessage('Dados atualizados com sucesso.');
        } finally {
            setIsSaving(false);
        }
    }

    async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!profile || isChangingPassword) return;

        setPasswordError(null);
        setPasswordSuccess(null);

        const validationErrors = validateChangePasswordFields(passwordDraft);
        if (Object.keys(validationErrors).length > 0) {
            setPasswordFieldErrors(validationErrors);
            return;
        }

        setPasswordFieldErrors({});
        setIsChangingPassword(true);

        try {
            const response = await changePassword({
                currentPassword: passwordDraft.currentPassword,
                newPassword: passwordDraft.newPassword,
            });

            if (typeof localStorage !== 'undefined' && response.token) {
                localStorage.setItem('token', response.token);
                notifyAuthTokenUpdated();
            }

            setPasswordDraft(EMPTY_PASSWORD_DRAFT);
            setPasswordSuccess(response.message || 'Senha alterada com sucesso!');
        } catch (err) {
            if (err instanceof ApiError && err.errors) {
                const nextErrors: AuthFieldErrors<ChangePasswordField> = {};
                if (err.errors.currentPassword) {
                    nextErrors.currentPassword = err.errors.currentPassword;
                }
                if (err.errors.newPassword) {
                    nextErrors.newPassword = err.errors.newPassword;
                }
                if (Object.keys(nextErrors).length > 0) {
                    setPasswordFieldErrors(nextErrors);
                    return;
                }
            }

            setPasswordError(
                formatAuthApiError(
                    err,
                    'Não foi possível alterar sua senha. Tente novamente.',
                ),
            );
        } finally {
            setIsChangingPassword(false);
        }
    }

    return {
        profile,
        displayName: profile?.name ?? 'jogador',
        roleLabel: profile ? ROLE_LABEL[profile.role] ?? profile.role : 'não identificado',
        license,
        isOpen,
        open,
        close,
        draft,
        errors,
        isSaving,
        savedMessage,
        setField,
        submit,
        passwordDraft,
        passwordFieldErrors,
        passwordError,
        passwordSuccess,
        isChangingPassword,
        setPasswordField,
        submitPasswordChange,
    };
}
