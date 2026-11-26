import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import "../LoginForm/LoginForm.css";

import { register } from "../../services/authService";
import type { RegisterRequest } from "../../types/auth";
import {
    AUTH_NAME_MAX_LENGTH,
    formatAuthApiError,
    normalizeEmail,
    validateRegisterFields,
    type AuthFieldErrors,
    type RegisterField,
} from "../../validation";
import { ApiError } from "../../../../services/api";
import InputEmail from "../../../../components/Inputs/InputEmail/InputEmail";
import InputPassword from "../../../../components/Inputs/InputPassword/InputPassword";
import AuthBrandPanel from "../../../../components/layout/AuthBrandPanel/AuthBrandPanel";
import Alert from "../../../../components/ui/Alert/Alert";
import Button from "../../../../components/ui/Button/Button";
import PasswordRequirements from "../PasswordRequirements/PasswordRequirements";

interface RegisterFormProps {
    onSuccess: () => void;
}

export default function RegisterForm({ onSuccess }: RegisterFormProps) {
    const redirectTimerRef = useRef<number | null>(null);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<RegisterField>>({});
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

    function clearFieldError(field: RegisterField) {
        if (fieldErrors[field]) {
            setFieldErrors((current) => ({ ...current, [field]: undefined }));
        }
        if (error) {
            setError(null);
        }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isLoading || success) return;

        setError(null);
        setSuccess(null);

        const validationErrors = validateRegisterFields({
            name,
            email,
            password,
            confirmPassword,
        });

        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            return;
        }

        setFieldErrors({});
        setIsLoading(true);

        try {
            const request: RegisterRequest = {
                name: name.trim(),
                email: normalizeEmail(email),
                password,
            };

            await register(request);

            setSuccess("Cadastro realizado com sucesso! Redirecionando para o login...");

            redirectTimerRef.current = window.setTimeout(() => {
                onSuccess();
            }, 1500);
        } catch (err) {
            if (err instanceof ApiError && err.status === 400 && err.errors) {
                const nextFieldErrors: AuthFieldErrors<RegisterField> = {};
                if (err.errors.name) nextFieldErrors.name = err.errors.name;
                if (err.errors.email) nextFieldErrors.email = err.errors.email;
                if (err.errors.password) nextFieldErrors.password = err.errors.password;
                if (Object.keys(nextFieldErrors).length > 0) {
                    setFieldErrors(nextFieldErrors);
                    return;
                }
            }
            setError(formatAuthApiError(err, "Erro ao realizar cadastro. Tente novamente."));
        } finally {
            setIsLoading(false);
        }
    }

    const isFormLocked = isLoading || Boolean(success);

    return (
        <div className="arena-background">
            <main className="login-container">
                <AuthBrandPanel
                    title="Crie sua conta"
                    description="Leva menos de um minuto para começar."
                />

                <form className="login-card" onSubmit={handleSubmit} noValidate>
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
                                onChange={(event) => {
                                    setName(event.target.value);
                                    clearFieldError("name");
                                }}
                                autoComplete="name"
                                disabled={isFormLocked}
                                maxLength={AUTH_NAME_MAX_LENGTH}
                                aria-required="true"
                                aria-invalid={fieldErrors.name ? true : undefined}
                                aria-describedby={fieldErrors.name ? "name-error" : undefined}
                            />
                        </div>
                        {fieldErrors.name && (
                            <p id="name-error" className="input-error" role="alert">
                                {fieldErrors.name}
                            </p>
                        )}
                    </div>

                    <InputEmail
                        email={email}
                        setEmail={(value) => {
                            setEmail(value);
                            clearFieldError("email");
                        }}
                        disabled={isFormLocked}
                        error={fieldErrors.email}
                    />

                    <InputPassword
                        id="password"
                        label="Senha"
                        textPlaceholder="Mínimo de 8 caracteres (letras e números)"
                        password={password}
                        setPassword={(value) => {
                            setPassword(value);
                            clearFieldError("password");
                        }}
                        autoComplete="new-password"
                        disabled={isFormLocked}
                        error={fieldErrors.password}
                    />

                    <PasswordRequirements password={password} />

                    <InputPassword
                        id="confirmPassword"
                        label="Confirmar senha"
                        textPlaceholder="Digite a senha novamente"
                        password={confirmPassword}
                        setPassword={(value) => {
                            setConfirmPassword(value);
                            clearFieldError("confirmPassword");
                        }}
                        autoComplete="new-password"
                        disabled={isFormLocked}
                        error={fieldErrors.confirmPassword}
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
                        disabled={Boolean(success)}
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
