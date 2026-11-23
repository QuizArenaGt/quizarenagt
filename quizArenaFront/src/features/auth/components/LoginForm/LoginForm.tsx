import React, { useState } from 'react';
import './LoginForm.css';
import { Link } from "react-router-dom";

import { login } from '../../services/authService';
import type { LoginRequest } from '../../types/auth';
import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import InputPassword from '../../../../components/Inputs/InputPassword/InputPassword';
import AuthBrandPanel from '../../../../components/layout/AuthBrandPanel/AuthBrandPanel';
import Alert from '../../../../components/ui/Alert/Alert';
import Button from '../../../../components/ui/Button/Button';

interface LoginFormProps {
    onSuccess: () => void;
    embedded?: boolean;
}

export default function LoginForm({ onSuccess, embedded = false }: LoginFormProps) {
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

    const ContainerTag = embedded ? 'div' : 'main';

    return (
        <div className="arena-background">
            <ContainerTag className="login-container">
                {!embedded && (
                    <AuthBrandPanel
                        title="Bem-vindo de volta!"
                        description="Entre com seu e-mail e senha para continuar."
                    />
                )}

                <form className="login-card" onSubmit={handleSubmit}>
                    <InputEmail
                        email={email}
                        setEmail={setEmail}
                        disabled={isLoading}
                    />

                    <InputPassword
                        password={password}
                        setPassword={setPassword}
                        disabled={isLoading}
                    />

                    <div className="forgot-password-wrapper">
                        <Link to="/recover-password" className="forgot-password-link">
                            Esqueceu sua senha?
                        </Link>
                    </div>

                    {error && (
                        <Alert variant="error">{error}</Alert>
                    )}

                    <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        isLoading={isLoading}
                    >
                        {isLoading ? 'Entrando…' : 'Entrar'}
                    </Button>
                </form>

                <footer className="login-footer">
                    <Link to="/register" className="footer-link highlighted">
                        Cadastre-se
                    </Link>
                </footer>
            </ContainerTag>
        </div>
    );
};