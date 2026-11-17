import type { ReactNode } from 'react';
import type { FeatureStatus, IconName } from '../../../models/landing';
import Badge from '../Badge/Badge';
import Icon from '../Icon/Icon';
import './FeatureCard.css';

interface FeatureCardProps {
    icon: IconName;
    title: string;
    description: string;
    /** Quando informado, exibe o selo Disponível / Em breve. */
    status?: FeatureStatus;
    /** Cor do ícone, para diferenciar visualmente grupos de cards. */
    tone?: 'primary' | 'accent' | 'highlight';
    /** Conteúdo extra abaixo da descrição (ex.: lista de benefícios). */
    children?: ReactNode;
}

export default function FeatureCard({
    icon,
    title,
    description,
    status,
    tone = 'primary',
    children,
}: FeatureCardProps) {
    return (
        <article className="ui-feature-card">
            <div className={`ui-feature-card__icon ui-feature-card__icon--${tone}`}>
                <Icon name={icon} size={22} />
            </div>
            <h3 className="ui-feature-card__title">{title}</h3>
            <p className="ui-feature-card__description">{description}</p>
            {children}
            {status && (
                <div className="ui-feature-card__status">
                    <Badge status={status} />
                </div>
            )}
        </article>
    );
}
