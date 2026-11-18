import { FEATURE_STATUS_LABEL, type FeatureStatus } from '../../../models/landing';
import './Badge.css';

interface BadgeProps {
    status: FeatureStatus;
}

/** Selo que indica se um recurso já está disponível ou ainda é previsto. */
export default function Badge({ status }: BadgeProps) {
    return (
        <span className={`ui-badge ui-badge--${status}`}>
            {FEATURE_STATUS_LABEL[status]}
        </span>
    );
}
