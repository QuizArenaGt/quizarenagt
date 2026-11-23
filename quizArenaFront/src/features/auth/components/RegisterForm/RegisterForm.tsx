
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import "../LoginForm/LoginForm.css";

import { register } from "../../services/authService";
import type { RegisterRequest } from "../../types/auth";
import InputEmail from "../../../../components/Inputs/InputEmail/InputEmail";
import InputPassword from "../../../../components/Inputs/InputPassword/InputPassword";
import AuthBrandPanel from "../../../../components/layout/AuthBrandPanel/AuthBrandPanel";
import Alert from "../../../../components/ui/Alert/Alert";
import Button from "../../../../components/ui/Button/Button";

interface RegisterFormProps {
    onSuccess: () => void;
}

export default function RegisterForm({ onSuccess
}: RegisterFormProps) {
    const redirectTimerRef = useRef<number | null>(null);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        return () => {
            if (redirectTimerRef.current !== null) {
                window.clearTimeout(redirectTimerRef.current);
            }
        };
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isLoading || success) return;

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

            redirectTimerRef.current = window.setTimeout(() => {
                onSuccess();
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
                <AuthBrandPanel
                    title="Crie sua conta"
                    description="Leva menos de um minuto para começar."
                />

                <form className="login-card" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="name" className="labelInput">
                            Nome
                        </label>
                        <div className="input-wrapper">
                            <span className="input-icon">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    aria-hidden="true"
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
                                type="text"
                                id="name"
                                name="name"
                                placeholder="Digite seu nome"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                autoComplete="name"
                                disabled={isLoading}
                                required
                                maxLength={100}
                            />
                        </div>
                    </div>

                    <InputEmail
                        email={email}
                        setEmail={setEmail}
                        disabled={isLoading}
                    />

                    <InputPassword
                        id="password"
                        label="Senha"
                        textPlaceholder="Mínimo de 8 caracteres"
                        password={password}
                        setPassword={setPassword}
                        autoComplete="new-password"
                        minLength={8}
                        disabled={isLoading}
                    />

                    <InputPassword
                        id="confirmPassword"
                        label="Confirmar senha"
                        textPlaceholder="Digite a senha novamente"
                        password={confirmPassword}
                        setPassword={setConfirmPassword}
                        autoComplete="new-password"
                        minLength={8}
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
                        {isLoading ? "Cadastrando…" : "Criar conta"}
                    </Button>
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
