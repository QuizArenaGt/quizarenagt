import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../LoginForm/LoginForm.css';

import { recoverPassword } from '../../services/authService';
import type { RecoverPasswordRequest } from '../../types/auth';
import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import AuthBrandPanel from '../../../../components/layout/AuthBrandPanel/AuthBrandPanel';
import Alert from '../../../../components/ui/Alert/Alert';
import Button from '../../../../components/ui/Button/Button';

interface RecoverPasswordFormProps {
    onSuccess: () => void;
}

export default function RecoverPasswordForm({ onSuccess }: RecoverPasswordFormProps) {
    const [email, setEmail] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const request: RecoverPasswordRequest = {
                email
            };

            await recoverPassword(request);
            setSuccess('Instruções enviadas! Verifique sua caixa de entrada.');
            onSuccess();
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

                <form className="login-card" onSubmit={handleSubmit}>
                    <InputEmail
                        email={email}
                        setEmail={setEmail}
                        disabled={isLoading}
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