import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
    ROLE_LABEL,
    sanitizePhone,
    validateProfile,
    type ProfileErrors,
    type ProfileField,
    type UserProfile,
} from '../models/profile';
import { getLicense, getProfile, updateProfile } from '../services/profileService';

type ProfileDraft = Pick<UserProfile, 'name' | 'email' | 'phone'>;

const EMPTY_DRAFT: ProfileDraft = { name: '', email: '', phone: '' };

/*
 * VIEWMODEL do perfil do usuário (aberto pelo nome no topo do painel).
 *
 * Expõe o usuário logado (usado também no cabeçalho), a licença e o
 * estado do formulário de edição. Validações ficam no Model
 * (validateProfile); a gravação, no profileService.
 */
export function useProfileViewModel() {
    const [profile, setProfile] = useState<UserProfile | null>(() => getProfile());
    const license = useMemo(() => getLicense(), []);

    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
    const [errors, setErrors] = useState<ProfileErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    const open = useCallback(() => {
        if (!profile) return;
        setDraft({ name: profile.name, email: profile.email, phone: profile.phone });
        setErrors({});
        setSavedMessage(null);
        setIsOpen(true);
    }, [profile]);

    const close = useCallback(() => setIsOpen(false), []);

    function setField(field: ProfileField, value: string) {
        setDraft((current) => ({ ...current, [field]: field === 'phone' ? sanitizePhone(value) : value }));
        // Ao corrigir um campo, a mensagem de erro dele some.
        setErrors((current) => ({ ...current, [field]: undefined }));
        setSavedMessage(null);
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
    };
}
