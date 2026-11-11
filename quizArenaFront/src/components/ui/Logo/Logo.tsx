import { useId } from 'react';
import './Logo.css';

/*
 * Logotipo do QuizArenaGT.
 *
 * Símbolo: balão de fala (interação) com um ponto de interrogação
 * (conhecimento) cujo ponto é uma estrela (conquista/competição).
 * O mesmo desenho é usado em public/favicon.svg.
 */
interface LogoProps {
    /** "light" para fundos claros, "dark" para fundos escuros. */
    variant?: 'light' | 'dark';
    /** Exibe o nome "QuizArenaGT" ao lado do símbolo. */
    showWordmark?: boolean;
    size?: number;
    className?: string;
}

export default function Logo({
    variant = 'light',
    showWordmark = true,
    size = 40,
    className = '',
}: LogoProps) {
    // Cada instância precisa de um id único para o gradiente, pois o logo
    // aparece mais de uma vez na mesma página (Header, Footer e modal).
    const gradientId = `logo-gradient-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    return (
        <span className={`ui-logo ui-logo--${variant} ${className}`.trim()}>
            <svg
                width={size}
                height={size}
                viewBox="0 0 64 64"
                role={showWordmark ? undefined : 'img'}
                aria-label={showWordmark ? undefined : 'QuizArenaGT'}
                aria-hidden={showWordmark ? true : undefined}
                focusable="false"
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#6D28D9" />
                        <stop offset="1" stopColor="#4F46E5" />
                    </linearGradient>
                </defs>
                <path
                    d="M18 6H46A12 12 0 0 1 58 18V38A12 12 0 0 1 46 50H28L16 59V49.4A12 12 0 0 1 6 38V18A12 12 0 0 1 18 6Z"
                    fill={`url(#${gradientId})`}
                />
                <path
                    d="M50 10.5A8 8 0 0 1 53.5 14"
                    stroke="#38BDF8"
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                />
                <path
                    d="M24.5 20.5A7.5 7.5 0 1 1 36.6 26.4C34 28.2 32 29.6 32 33"
                    stroke="#FFFFFF"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
                <path
                    d="M32 37.5L33.5 40.5L36.5 42L33.5 43.5L32 46.5L30.5 43.5L27.5 42L30.5 40.5Z"
                    fill="#FACC15"
                />
            </svg>

            {showWordmark && (
                <span className="ui-logo__wordmark">
                    Quiz<span className="ui-logo__highlight">Arena</span>
                    <span className="ui-logo__tag">GT</span>
                </span>
            )}
        </span>
    );
}
