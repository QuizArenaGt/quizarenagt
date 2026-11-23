import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import '../LoginForm/LoginForm.css';

import { resetPassword } from '../../services/authService';
import {
    formatAuthApiError,
    validateResetPasswordFields,
    type AuthFieldErrors,
    type ResetPasswordField,
} from '../../validation';
import { ApiError } from '../../../../services/api';
import InputPassword from '../../../../components/Inputs/InputPassword/InputPassword';
import AuthBrandPanel from '../../../../components/layout/AuthBrandPanel/AuthBrandPanel';
import Alert from '../../../../components/ui/Alert/Alert';
import Button from '../../../../components/ui/Button/Button';

const REDIRECT_DELAY_MS = 1800;

export default function ResetPasswordForm() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const redirectTimerRef = useRef<number | null>(null);

    const token = searchParams.get('token')?.trim() ?? '';

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<ResetPasswordField>>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        return () => {
            if (redirectTimerRef.current !== null) {
                window.clearTimeout(redirectTimerRef.current);
            }
        };
    }, []);

    function clearFieldError(field: ResetPasswordField) {
        if (fieldErrors[field]) {
            setFieldErrors((current) => ({ ...current, [field]: undefined }));
        }
        if (error) {
            setError(null);
        }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isLoading || success) return;

        setError(null);
        setSuccess(null);

        if (!token) {
            setError('Link inválido ou sem token de recuperação. Solicite um novo link.');
            return;
        }

        const validationErrors = validateResetPasswordFields({
            newPassword,
            confirmPassword,
        });

        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            return;
        }

        setFieldErrors({});
        setIsLoading(true);

        try {
            const response = await resetPassword({
                token,
                newPassword,
            });

            setNewPassword('');
            setConfirmPassword('');
            setSuccess(
                response.message
                    ? `${response.message} Redirecionando para o login...`
                    : 'Senha redefinida com sucesso! Redirecionando para o login...',
            );

            redirectTimerRef.current = window.setTimeout(() => {
                navigate('/login');
            }, REDIRECT_DELAY_MS);
        } catch (err) {
            if (err instanceof ApiError && err.status === 400 && err.errors) {
                if (err.errors.newPassword) {
                    setFieldErrors({ newPassword: err.errors.newPassword });
                    return;
                }
                if (err.errors.token) {
                    setError(err.errors.token);
                    return;
                }
            }

            setError(
                formatAuthApiError(
                    err,
                    'Não foi possível redefinir sua senha. Solicite um novo link.',
                ),
            );
        } finally {
            setIsLoading(false);
        }
    }

    const hasToken = token.length > 0;
    const isFormLocked = isLoading || Boolean(success);

    return (
        <div className="arena-background">
            <main className="login-container">
                <AuthBrandPanel
                    title="Nova senha"
                    description="Informe sua nova senha e confirme para concluir a recuperação da sua conta."
                />

                {hasToken ? (
                    <form className="login-card" onSubmit={handleSubmit} noValidate>
                        <InputPassword
                            id="newPassword"
                            name="newPassword"
                            label="Nova senha"
                            textPlaceholder="Digite sua nova senha"
                            password={newPassword}
                            setPassword={(value) => {
                                setNewPassword(value);
                                clearFieldError('newPassword');
                            }}
                            autoComplete="new-password"
                            disabled={isFormLocked}
                            error={fieldErrors.newPassword}
                        />

                        <InputPassword
                            id="confirmPassword"
                            name="confirmPassword"
                            label="Confirmar nova senha"
                            textPlaceholder="Confirme sua nova senha"
                            password={confirmPassword}
                            setPassword={(value) => {
                                setConfirmPassword(value);
                                clearFieldError('confirmPassword');
                            }}
                            autoComplete="new-password"
                            disabled={isFormLocked}
                            error={fieldErrors.confirmPassword}
                        />

                        {error && <Alert variant="error">{error}</Alert>}
                        {success && <Alert variant="success">{success}</Alert>}

                        <Button
                            type="submit"
                            size="lg"
                            fullWidth
                            isLoading={isLoading}
                            disabled={isFormLocked}
                        >
                            {isLoading ? 'Redefinindo…' : 'Redefinir senha'}
                        </Button>
                    </form>
                ) : (
                    <div className="login-card">
                        <Alert variant="error">
                            Não foi possível identificar o token de recuperação. Solicite um novo link.
                        </Alert>

                        <Button
                            type="button"
                            size="lg"
                            fullWidth
                            onClick={() => navigate('/recover-password')}
                        >
                            Solicitar novo link
                        </Button>
                    </div>
                )}

                <footer className="login-footer">
                    <Link to="/login" className="footer-link highlighted">
                        Voltar ao login
                    </Link>
                </footer>
            </main>
        </div>
    );
}
