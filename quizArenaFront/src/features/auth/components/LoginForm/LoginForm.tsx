import React, { useState } from 'react';
import './LoginForm.css';

import { login } from '../../services/authService';
import type { LoginRequest } from '../../types/auth';

interface LoginFormProps {
  onSuccess: () => void;
}

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hashHex;
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
            const hashedPassword = await hashPassword(password);
            const request: LoginRequest = {
                email,
                password: hashedPassword
            };

            const response = await login(request);
            console.log('Response: ', response);
            onSuccess();
        } catch (error) {
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
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <span className="input-icon">
                                <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </span>
                            <input type="email" 
                                   id="email" 
                                   placeholder="Digite seu email" 
                                   value={email}
                                   onChange={(e) => setEmail(e.target.value)}
                                   required />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Senha</label>
                        <div className="input-wrapper">
                            <span className="input-icon">
                                <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </span>
                            <input type="password" 
                                   id="password" 
                                   placeholder="••••••••" 
                                   value={password}
                                   onChange={(e) => setPassword(e.target.value)}
                                   required />
                            <span className="password-toggle">
                                <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            </span>
                            { error && (
                                <div className="login-error">{error}</div>
                            )}
                        </div>
                    </div>

                    <div className="forgot-password-wrapper">
                        <a href="#" className="forgot-password-link">Esqueceu sua senha?</a>
                    </div>
                    <button type="submit" className="btn-submit" disabled={isLoading}>{ isLoading ? 'ENTRANDO...' : 'ENTRAR' }</button>
                </form>

                <footer className="login-footer">
                    <a href="#" className="footer-link highlighted">Cadastre-se</a>
                </footer>
            </main>
        </div>
    );
};