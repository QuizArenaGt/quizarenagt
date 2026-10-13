import React, { useState } from 'react';
import './LoginForm.css';

import { login } from '../../services/authService';
import type { LoginRequest } from '../../types/auth';
import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import InputPassword from '../../../../components/Inputs/InputPassword/InputPassword';

interface LoginFormProps {
  onSuccess: () => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
    const [email, setEmail]         = useState<string>('');
    const [password, setPassword]   = useState<string>('');
    const [error, setError]         = useState<string | null>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const request: LoginRequest = {
                email,
                password
            };

            const response = await login(request);
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
                    <InputEmail 
                        email={email} 
                        setEmail={setEmail} 
                    />

                    <InputPassword                    
                        password={password}
                        setPassword={setPassword}
                    />

                    <div className="forgot-password-wrapper">
                        <a href="/recover-password" className="forgot-password-link">Esqueceu sua senha?</a> 
                    </div>

                    <div>
                        { error && (
                            <div className="login-error">{error}</div>
                        )}
                    </div>
                    <button type="submit" className="btn-submit" disabled={isLoading}>{ isLoading ? 'ENTRANDO...' : 'ENTRAR' }</button>
                </form>

                <footer className="login-footer">
                    <a href="/register" className="footer-link highlighted">Cadastre-se</a>
                </footer>
            </main>
        </div>
    );
};