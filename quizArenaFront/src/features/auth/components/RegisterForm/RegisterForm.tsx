
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import './RegisterForm.css';

import { register } from '../../services/authService';
import type { RegisterRequest } from '../../types/auth';

import InputEmail from '../../../../components/Inputs/InputEmail/InputEmail';
import InputPassword from '../../../../components/Inputs/InputPassword/InputPassword';

interface RegisterFormProps {
    onSuccess: () => void;
}

export default function RegisterForm({
    onSuccess
}: RegisterFormProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (
        event: React.FormEvent<HTMLFormElement>
    ): Promise<void> => {
        event.preventDefault();

        setError(null);

        // Validações locais
        if (!name.trim()) {
            setError('Informe seu nome.');
            return;
        }

        if (!email.trim()) {
            setError('Informe seu e-mail.');
            return;
        }

        if (!password) {
            setError('Informe sua senha.');
            return;
        }

        if (!confirmPassword) {
            setError('Confirme sua senha.');
            return;
        }

        if (password !== confirmPassword) {
            setError('As senhas informadas não coincidem.');
            return;
        }

        setIsLoading(true);

        try {
            const request: RegisterRequest = {
                name: name.trim(),
                email: email.trim(),
                password,
                confirmPassword
            };

            const response = await register(request);

            console.log('Cadastro realizado:', response);

            onSuccess();
        } catch (err: unknown) {
            console.error('Erro ao realizar cadastro:', err);

            setError(
                'Não foi possível realizar o cadastro. Verifique os dados e tente novamente.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="arena-background register-page">
            <main className="login-container">
                <header className="brand-header">
                    <div className="shield-logo">
                        <div className="shield-half left" />
                        <div className="shield-half right" />
                        <div className="brain-star-core">✨</div>
                    </div>

                    <h1 className="brand-title">QUIZ ARENA</h1>

                    <p className="brand-subtitle">
                        O DESAFIO DO CONHECIMENTO
                    </p>
                </header>

                <form
                    className="login-card register-card"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <h2>Cadastro</h2>

                    <p className="register-description">
                        Insira seu nome, e-mail e senha para criar uma conta.
                    </p>

                    <div className="input-wrapper">
                        <span className="input-icon" aria-hidden="true">
                            <svg
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                            </svg>
                        </span>

                        <input
                            id="register-name"
                            name="name"
                            type="text"
                            placeholder="Digite seu nome"
                            autoComplete="name"
                            value={name}
                            onChange={(event) =>
                                setName(event.target.value)
                            }
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <InputEmail
                        email={email}
                        setEmail={setEmail}
                    />

                    <InputPassword
                        password={password}
                        setPassword={setPassword}
                    />

                    <InputPassword
                        textPlaceholder="Confirme sua senha"
                        password={confirmPassword}
                        setPassword={setConfirmPassword}
                    />

                    {error && (
                        <div
                            className="login-error"
                            role="alert"
                            aria-live="polite"
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-submit"
                        disabled={isLoading}
                    >
                        {isLoading
                            ? 'REALIZANDO CADASTRO...'
                            : 'ENVIAR DADOS'}
                    </button>
                </form>

                <footer className="login-footer">
                    <Link
                        to="/login"
                        className="footer-link highlighted"
                    >
                        Voltar ao login
                    </Link>
                </footer>
            </main>
        </div>
    );
}
