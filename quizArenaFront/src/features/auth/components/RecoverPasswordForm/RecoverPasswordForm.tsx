import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../LoginForm/LoginForm.css';

import { recoverPassword } from '../../services/authService';
import type { RecoverPasswordRequest } from '../../types/auth';
import {
    validateRecoverPasswordFields,
    type AuthFieldErrors,
    type RecoverPasswordField,
} from '../../validation';
import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import AuthBrandPanel from '../../../../components/layout/AuthBrandPanel/AuthBrandPanel';
import Alert from '../../../../components/ui/Alert/Alert';
import Button from '../../../../components/ui/Button/Button';

interface RecoverPasswordFormProps {
    onSuccess?: () => void;
}

export default function RecoverPasswordForm({ onSuccess }: RecoverPasswordFormProps) {
    const [email, setEmail] = useState<string>('');
    const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<RecoverPasswordField>>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    function handleEmailChange(value: string) {
        setEmail(value);
        if (fieldErrors.email) {
            setFieldErrors({});
        }
        if (error) {
            setError(null);
        }
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        const validationErrors = validateRecoverPasswordFields({ email });
        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            return;
        }

        setFieldErrors({});
        setIsLoading(true);

        try {
            const request: RecoverPasswordRequest = {
                email: email.trim(),
            };

            const response = await recoverPassword(request);
            setSuccess(
                response.message ||
                    'Se o e-mail estiver cadastrado, você receberá instruções para recuperar sua senha.'
            );
            setEmail('');
            onSuccess?.();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível enviar as instruções. Tente novamente.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="arena-background">
            <main className="login-container">
                <AuthBrandPanel
                    title="Recuperar senha"
                    description="Informe seu e-mail cadastrado para receber as instruções de redefinição."
                />

                <form className="login-card" onSubmit={handleSubmit} noValidate>
                    <InputEmail
                        email={email}
                        setEmail={handleEmailChange}
                        disabled={isLoading}
                        error={fieldErrors.email}
                    />

                    {error && (
                        <Alert variant="error">{error}</Alert>
                    )}

                    {success && (
                        <Alert variant="success">{success}</Alert>
                    )}

                    <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        isLoading={isLoading}
                    >
                        {isLoading ? 'Enviando…' : 'Enviar instruções'}
                    </Button>
                </form>

                <footer className="login-footer">
                    <Link to="/login" className="footer-link highlighted">
                        Voltar ao login
                    </Link>
                </footer>
            </main>
        </div>
    );
}
