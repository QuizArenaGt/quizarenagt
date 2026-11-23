import type { ChangeEvent } from 'react';
import './InputEmail.css';

interface InputEmailProps {
    email: string;
    setEmail: (email: string) => void;
    id?: string;
    label?: string;
    placeholder?: string;
    autoComplete?: string;
    disabled?: boolean;
    error?: string | null;
}

export default function InputEmail({
    email,
    setEmail,
    id = 'email',
    label = 'Email',
    placeholder = 'Digite seu email',
    autoComplete = 'email',
    disabled = false,
    error = null,
}: InputEmailProps) {
    const errorId = `${id}-error`;

    function handleEmailChange(
        event: ChangeEvent<HTMLInputElement>
    ): void {
        setEmail(event.target.value);
    }

    return (
        <div className="input-group">
            <label htmlFor={id} className="labelInput">
                {label}
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
                            d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                        />
                    </svg>
                </span>

                <input
                    type="email"
                    id={id}
                    name={id}
                    placeholder={placeholder}
                    value={email}
                    onChange={handleEmailChange}
                    autoComplete={autoComplete}
                    disabled={disabled}
                    aria-required="true"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                />
            </div>

            {error && (
                <p id={errorId} className="input-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
