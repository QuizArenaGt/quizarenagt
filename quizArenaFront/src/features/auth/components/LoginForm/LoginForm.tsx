import React, { useState } from 'react';
import './LoginForm.css';
import { Link, useLocation } from "react-router-dom";

import { login } from '../../services/authService';
import type { LoginRequest } from '../../types/auth';
import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import InputPassword from '../../../../components/Inputs/InputPassword/InputPassword';

interface LoginFormProps {
    onSuccess: () => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
    const location = useLocation();
    const registered = location.state?.registered === true;
    const [email, setEmail] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
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

            localStorage.setItem("token", response.token);
            localStorage.setItem("user", JSON.stringify(response.user));

            onSuccess();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Erro ao fazer login. Tente novamente."
            );
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
                    <button type="submit" className="btn-submit" disabled={isLoading}>{isLoading ? 'ENTRANDO...' : 'ENTRAR'}</button>
                </form>

                <footer className="login-footer">
                    <Link to="/register" className="footer-link highlighted">
                        Cadastre-se
                    </Link>
                </footer>
            </main>
        </div>
    );
};