
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { resetPassword } from "../../services/authService";
import "./ResetPasswordForm.css";

const MIN_PASSWORD_LENGTH = 8;
const REDIRECT_DELAY = 2000;

export default function ResetPasswordForm() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = searchParams.get("token");

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const isTokenValid = Boolean(token);
    const isCompleted = Boolean(success);

    useEffect(() => {
        if (!success) return;

        const timeoutId = setTimeout(() => {
            navigate("/login");
        }, REDIRECT_DELAY);

        return () => clearTimeout(timeoutId);
    }, [success, navigate]);

    function validateForm(): string | null {
        if (!token) {
            return "Link inválido ou sem token de recuperação.";
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return `A senha deve possuir pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
        }

        if (newPassword !== confirmPassword) {
            return "As senhas informadas não coincidem.";
        }

        return null;
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setSuccess("");

        const validationError = validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setIsLoading(true);

            const response = await resetPassword({
                token: token!,
                newPassword,
            });

            setSuccess(
                response.message || "Senha redefinida com sucesso!"
            );

            setNewPassword("");
            setConfirmPassword("");

        } catch (err: unknown) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Não foi possível redefinir sua senha."
            );
        } finally {
            setIsLoading(false);
        }
    }

    function handleRecoverPassword() {
        navigate("/recover-password");
    }

    function handleLogin() {
        navigate("/login");
    }

    return (
        <div className="recover-page">
            <div className="login-container">

                <div className="brand-header">
                    <h1 className="brand-title">Quiz Arena</h1>
                    <p className="brand-subtitle">
                        REDEFINIÇÃO DE SENHA
                    </p>
                </div>

                <div className="login-card">

                    <h2>Nova senha</h2>

                    <p className="recover-description">
                        Informe sua nova senha e confirme para concluir
                        a recuperação da sua conta.
                    </p>

                    {error && (
                        <div className="login-error" role="alert">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div
                            className="login-success"
                            role="status"
                            aria-live="polite"
                        >
                            {success}
                            <p>Você será redirecionado para o login.</p>
                        </div>
                    )}

                    {isTokenValid ? (
                        <form onSubmit={handleSubmit}>

                            <div className="form-group">
                                <label htmlFor="newPassword">
                                    Nova senha
                                </label>

                                <div className="input-wrapper">
                                    <input
                                        id="newPassword"
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) =>
                                            setNewPassword(event.target.value)
                                        }
                                        placeholder="Digite sua nova senha"
                                        autoComplete="new-password"
                                        minLength={MIN_PASSWORD_LENGTH}
                                        required
                                        disabled={isLoading || isCompleted}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="confirmPassword">
                                    Confirmar nova senha
                                </label>

                                <div className="input-wrapper">
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) =>
                                            setConfirmPassword(event.target.value)
                                        }
                                        placeholder="Confirme sua nova senha"
                                        autoComplete="new-password"
                                        minLength={MIN_PASSWORD_LENGTH}
                                        required
                                        disabled={isLoading || isCompleted}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn-submit"
                                disabled={isLoading || isCompleted}
                            >
                                {isLoading
                                    ? "REDEFININDO..."
                                    : "REDEFINIR SENHA"}
                            </button>

                        </form>
                    ) : (
                        <>
                            <p className="recover-description">
                                Não foi possível identificar o token de
                                recuperação. Solicite um novo link.
                            </p>

                            <button
                                type="button"
                                className="btn-submit"
                                onClick={handleRecoverPassword}
                            >
                                SOLICITAR NOVO LINK
                            </button>
                        </>
                    )}

                    <div className="login-footer">
                        <button
                            type="button"
                            className="footer-link highlighted"
                            onClick={handleLogin}
                        >
                            Voltar para o login
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
