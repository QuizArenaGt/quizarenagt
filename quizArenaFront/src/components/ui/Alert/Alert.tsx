import type { ReactNode } from 'react';
import Icon, { type IconName } from '../Icon/Icon';
import './Alert.css';

export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

interface AlertProps {
    variant?: AlertVariant;
    title?: string;
    children: ReactNode;
    className?: string;
}

const ALERT_ICON: Record<AlertVariant, IconName> = {
    error: 'error',
    warning: 'warning',
    success: 'success',
    info: 'info',
};

/** Caixa de feedback semântica padronizada para erros, avisos, confirmações e informações. */
export default function Alert({
    variant = 'info',
    title,
    children,
    className = '',
}: AlertProps) {
    const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';

    return (
        <div
            className={`ui-alert ui-alert--${variant}${className ? ` ${className}` : ''}`}
            role={role}
        >
            <span className="ui-alert__icon" aria-hidden="true">
                <Icon name={ALERT_ICON[variant]} size={18} />
            </span>
            <div className="ui-alert__body">
                {title && <strong className="ui-alert__title">{title}</strong>}
                <div className="ui-alert__content">{children}</div>
            </div>
        </div>
    );
}
