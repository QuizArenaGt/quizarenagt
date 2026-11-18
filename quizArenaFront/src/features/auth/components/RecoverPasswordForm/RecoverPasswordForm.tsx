import React, { useState } from 'react';
import './RecoverPasswordForm.css';

import { recoverPassword } from '../../services/authService';
import type { RecoverPasswordRequest } from '../../types/auth';

import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import AuthBrandPanel from '../../../../components/layout/AuthBrandPanel/AuthBrandPanel';

export default function RecoverPasswordForm() {

    const [email, setEmail] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (
        event: React.FormEvent<HTMLFormElement>
    ): Promise<void> => {

        event.preventDefault();

        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {

            const request: RecoverPasswordRequest = {
                email: email.trim()
            };

            await recoverPassword(request);

            setSuccess(
                'Se o e-mail estiver cadastrado, você receberá as instruções para recuperar sua senha.'
            );

        } catch (error: unknown) {

            console.error(
                'Erro ao solicitar recuperação de senha:',
                error
            );

            setError(
                'Não foi possível processar sua solicitação. Tente novamente.'
            );

        } finally {

            setIsLoading(false);

        }
    };

    return (
        <div className="arena-background">

            <main className="login-container">
                {/* Sem título aqui: o formulário já tem o seu ("Recuperar Senha") */}
                <AuthBrandPanel />

                <form
                    className="login-card"
                    onSubmit={handleSubmit}
                >

                    <h2>Recuperar Senha</h2>

                    <h4>
                        Insira seu e-mail cadastrado para receber
                        as instruções de redefinição.
                    </h4>

                    <InputEmail
                        email={email}
                        setEmail={setEmail}
                    />

                    {error && (
                        <div className="login-error">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="login-success">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-submit"
                        disabled={isLoading}
                    >
                        {isLoading
                            ? 'ENVIANDO...'
                            : 'ENVIAR INSTRUÇÕES'
                        }
                    </button>

                </form>

                <footer className="login-footer">

                    <a
                        href="/login"
                        className="footer-link highlighted"
                    >
                        Voltar ao login
                    </a>

                </footer>

            </main>

        </div>
    );
}