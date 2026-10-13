
import type { ChangeEvent } from 'react';
import './InputEmail.css';

interface InputEmailProps {
    email: string;
    setEmail: (email: string) => void;
}

export default function InputEmail({
    email,
    setEmail
}: InputEmailProps) {

    function handleEmailChange(
        event: ChangeEvent<HTMLInputElement>
    ): void {
        setEmail(event.target.value);
    }

    return (
        <div className="input-group">
            <label htmlFor="email" className="labelInput">
                Email
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
                            //d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                    </svg>
                </span>

                <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Digite seu email"
                    value={email}
                    onChange={handleEmailChange}
                    autoComplete="email"
                    required
                />
            </div>
        </div>
    );
}