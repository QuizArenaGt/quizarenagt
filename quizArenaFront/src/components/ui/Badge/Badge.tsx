import type { ReactNode } from 'react';
import { FEATURE_STATUS_LABEL, type FeatureStatus } from '../../../models/landing';
import './Badge.css';

export type BadgeVariant = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

type BadgeProps =
    | {
          status: FeatureStatus;
          variant?: never;
          children?: never;
          className?: string;
      }
    | {
          status?: never;
          variant?: BadgeVariant;
          children: ReactNode;
          className?: string;
      };

/** Selo reutilizável: aceita `status` da landing page ou `variant` semântica genérica. */
export default function Badge(props: BadgeProps) {
    const classNameSuffix = props.className ? ` ${props.className}` : '';

    if (props.status) {
        return (
            <span className={`ui-badge ui-badge--${props.status}${classNameSuffix}`}>
                {FEATURE_STATUS_LABEL[props.status]}
            </span>
        );
    }

    const variant = props.variant ?? 'neutral';
    return (
        <span className={`ui-badge ui-badge--${variant}${classNameSuffix}`}>
            {props.children}
        </span>
    );
}
