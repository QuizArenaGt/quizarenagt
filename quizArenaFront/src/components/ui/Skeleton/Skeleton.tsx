import './Skeleton.css';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    variant?: 'text' | 'rect' | 'circle';
    className?: string;
}

/** Placeholder visual para áreas em carregamento. */
export function Skeleton({
    width,
    height,
    variant = 'rect',
    className = '',
}: SkeletonProps) {
    return (
        <span
            className={`ui-skeleton ui-skeleton--${variant}${className ? ` ${className}` : ''}`}
            style={{ width, height }}
            aria-hidden="true"
        />
    );
}

interface LoadingStateProps {
    label?: string;
    className?: string;
}

/** Indicador acessível de carregamento para telas e painéis. */
export function LoadingState({
    label = 'Carregando…',
    className = '',
}: LoadingStateProps) {
    return (
        <div
            className={`ui-loading${className ? ` ${className}` : ''}`}
            role="status"
            aria-live="polite"
        >
            <span className="ui-loading__spinner" aria-hidden="true" />
            <span className="ui-loading__label">{label}</span>
        </div>
    );
}
