import type { ReactNode } from 'react';
import Icon, { type IconName } from '../Icon/Icon';
import './EmptyState.css';

interface EmptyStateProps {
    icon?: IconName;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

/** Estado vazio padronizado para listas, tabelas e áreas sem conteúdo. */
export default function EmptyState({
    icon,
    title,
    description,
    action,
    className = '',
}: EmptyStateProps) {
    return (
        <div className={`ui-empty${className ? ` ${className}` : ''}`}>
            {icon && (
                <span className="ui-empty__icon" aria-hidden="true">
                    <Icon name={icon} size={24} />
                </span>
            )}
            <h3 className="ui-empty__title">{title}</h3>
            {description && <p className="ui-empty__description">{description}</p>}
            {action && <div className="ui-empty__action">{action}</div>}
        </div>
    );
}
