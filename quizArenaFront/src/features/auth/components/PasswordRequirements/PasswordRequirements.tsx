import { getPasswordRequirements } from '../../validation';
import './PasswordRequirements.css';

interface PasswordRequirementsProps {
    password: string;
}

export default function PasswordRequirements({ password }: PasswordRequirementsProps) {
    const checks = getPasswordRequirements(password);
    const hasInput = password.length > 0;

    return (
        <div className="password-requirements" aria-label="Requisitos da senha">
            <p className="password-requirements__title">Requisitos da senha:</p>
            <ul className="password-requirements__list">
                {checks.map((item) => {
                    const statusClass = !hasInput
                        ? 'password-requirements__item--idle'
                        : item.met
                          ? 'password-requirements__item--met'
                          : 'password-requirements__item--pending';

                    return (
                        <li
                            key={item.key}
                            className={`password-requirements__item ${statusClass}`}
                        >
                            <span
                                className="password-requirements__indicator"
                                aria-hidden="true"
                            >
                                {item.met ? '✓' : '•'}
                            </span>
                            <span>{item.label}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
