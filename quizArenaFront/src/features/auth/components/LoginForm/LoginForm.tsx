import React, { useState } from 'react';
import './LoginForm.css';
import { Link } from "react-router-dom";

import { login } from '../../services/authService';
import type { LoginRequest } from '../../types/auth';
import {
    formatAuthApiError,
    validateLoginFields,
    type AuthFieldErrors,
    type LoginField,
} from '../../validation';
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
    const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<LoginField>>({});
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    function handleEmailChange(value: string) {
        setEmail(value);
        if (fieldErrors.email) {
            setFieldErrors((current) => ({ ...current, email: undefined }));
        }
        if (error) {
            setError(null);
        }
    }

    function handlePasswordChange(value: string) {
        setPassword(value);
        if (fieldErrors.password) {
            setFieldErrors((current) => ({ ...current, password: undefined }));
        }
        if (error) {
            setError(null);
        }
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        const validationErrors = validateLoginFields({ email, password });
        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            return;
        }

        setFieldErrors({});
        setIsLoading(true);

        try {
            const request: LoginRequest = {
                email: email.trim(),
                password,
            };

            const response = await login(request);

            localStorage.setItem("token", response.token);
            localStorage.setItem("user", JSON.stringify(response.user));

            onSuccess();
        } catch (err) {
            setError(formatAuthApiError(err, "Erro ao fazer login. Tente novamente."));
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

                <form className="login-card" onSubmit={handleSubmit} noValidate>
                    <InputEmail
                        email={email}
                        setEmail={handleEmailChange}
                        disabled={isLoading}
                        error={fieldErrors.email}
                    />

                    <InputPassword
                        password={password}
                        setPassword={handlePasswordChange}
                        disabled={isLoading}
                        error={fieldErrors.password}
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
}
