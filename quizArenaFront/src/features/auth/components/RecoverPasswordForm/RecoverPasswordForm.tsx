import React, { useState } from 'react';
import './RecoverPasswordForm.css';

import { recoverPassword } from '../../services/authService';
import type { RecoverPasswordRequest } from '../../types/auth';
import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';

interface RecoverPasswordFormProps {
  onSuccess: () => void;
}

export default function RecoverPasswordForm({ onSuccess }: RecoverPasswordFormProps) {
    const [email, setEmail]         = useState<string>('');
    const [error, setError]         = useState<string | null>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const request: RecoverPasswordRequest = {
                email
            };

            const response = await recoverPassword(request);
            console.log('Response: ', response);
            onSuccess();
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            if (error instanceof Error) {
                console.error('Mensagem', error.message);
                console.error('Stack', error.stack);
            }
            setError('Erro ao fazer login. Por favor, tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="arena-background">
            <main className="login-container">
                <header className="brand-header">
                    <div className="shield-logo">
                        <div className="shield-half left"></div>
                        <div className="shield-half right"></div>
                        <div className="brain-star-core">✨</div>
                    </div>
                    <h1 className="brand-title">QUIZ ARENA</h1>
                    <p className="brand-subtitle">O DESAFIO DO CONHECIMENTO</p>
                </header>

                <form className="login-card" onSubmit={handleSubmit}>
                    <h2>Recuperar Senha</h2>
                    <h4>Insira seu e-mail cadastrado para receber as instruções de redefinição</h4>
                    
                    <InputEmail 
                        email={email} 
                        setEmail={setEmail} 
                    />

                    <div>
                        { error && (
                            <div className="login-error">{error}</div>
                        )}
                    </div>
                    <button type="submit" className="btn-submit" disabled={isLoading}>ENVIAR INSTRUÇÕES</button>
                </form>

                <footer className="login-footer">
                    <a href="/login" className="footer-link highlighted">Voltar ao login</a>
                </footer>
            </main>
        </div>
    );
};