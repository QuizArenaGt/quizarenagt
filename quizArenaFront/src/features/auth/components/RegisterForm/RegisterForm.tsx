
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../LoginForm/LoginForm.css";

import { register } from "../../services/authService";
import type { RegisterRequest } from "../../types/auth";

export default function RegisterForm() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        if (password.length < 8) {
            setError("A senha deve possuir pelo menos 8 caracteres.");
            return;
        }

        if (password !== confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }

        setIsLoading(true);

        try {
            const request: RegisterRequest = {
                name,
                email,
                password,
            };

            await register(request);

            setSuccess("Cadastro realizado com sucesso! Redirecionando para o login...");

            setTimeout(() => {
                navigate("/login", {
                    state: { registered: true },
                });
            }, 1500);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Erro ao realizar cadastro. Tente novamente."
            );
        } finally {
            setIsLoading(false);
        }
    }

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
                        <label htmlFor="name">Nome</label>
                        <div className="input-wrapper">
                            <input
                                type="text"
                                id="name"
                                placeholder="Digite seu nome"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                maxLength={100}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <input
                                type="email"
                                id="email"
                                placeholder="Digite seu email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Senha</label>
                        <div className="input-wrapper">
                            <input
                                type="password"
                                id="password"
                                placeholder="Mínimo de 8 caracteres"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                minLength={8}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="confirmPassword">Confirmar senha</label>
                        <div className="input-wrapper">
                            <input
                                type="password"
                                id="confirmPassword"
                                placeholder="Digite a senha novamente"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="login-error" role="alert">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="register-success" role="status">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-submit"
                        disabled={isLoading}
                    >
                        {isLoading ? "CADASTRANDO..." : "CADASTRAR"}
                    </button>
                </form>

                <footer className="login-footer">
                    <Link to="/login" className="footer-link highlighted">
                        Já possui uma conta? Entrar
                    </Link>
                </footer>
            </main>
        </div>
    );
}
