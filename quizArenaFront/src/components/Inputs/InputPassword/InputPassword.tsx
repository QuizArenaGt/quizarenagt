
import { useState } from 'react';
import type { ChangeEvent } from 'react';

import './InputPassword.css';

interface InputPasswordProps {
    textPlaceholder?: string;
    password: string;
    setPassword: (password: string) => void;
}

export default function InputPassword({
    textPlaceholder,
    password,
    setPassword
}: InputPasswordProps) {

    const [showPassword, setShowPassword] = useState(false);

    function handlePasswordChange(
        event: ChangeEvent<HTMLInputElement>
    ): void {
        setPassword(event.target.value);
    }

    function handleTogglePassword(): void {
        setShowPassword((previousValue) => !previousValue);
    }

    return (
        <div className="input-group">
            <label htmlFor="password" className="labelInput">
                Senha
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
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                    </svg>
                </span>

                <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    placeholder={textPlaceholder || 'Digite sua senha'}
                    value={password}
                    onChange={handlePasswordChange}
                    autoComplete="current-password"
                    required
                />

                <button
                    type="button"
                    className="password-toggle"
                    onClick={handleTogglePassword}
                    aria-label={
                        showPassword
                            ? 'Ocultar senha'
                            : 'Mostrar senha'
                    }
                    aria-pressed={showPassword}
                >
                    {showPassword ? (
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
                                d="M2.25 12s3.5-7 9.75-7 9.75 7 9.75 7-3.5 7-9.75 7-9.75-7-9.75-7z"
                            />
                            <circle
                                cx="12"
                                cy="12"
                                r="3"
                                strokeWidth="2"
                            />
                        </svg>
                    ) : (
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
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18"
                            />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}
