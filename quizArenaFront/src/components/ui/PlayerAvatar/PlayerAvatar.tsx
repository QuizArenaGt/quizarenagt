import type { CSSProperties } from 'react';
import { getAvatarMeta } from '../../../models/avatars';
import { PlayerAvatarArt } from './PlayerAvatarArt';
import './PlayerAvatar.css';

export type PlayerAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface PlayerAvatarProps {
    avatarId?: string | null;
    nickname?: string;
    size?: PlayerAvatarSize;
    decorative?: boolean;
    selected?: boolean;
    className?: string;
}

export function PlayerAvatar({
    avatarId,
    nickname,
    size = 'md',
    decorative = false,
    selected = false,
    className = '',
}: PlayerAvatarProps) {
    const meta = getAvatarMeta(avatarId);
    const accessibleLabel = nickname
        ? `${nickname} — Avatar ${meta.name}`
        : `Avatar ${meta.name}`;

    const frameStyle = {
        '--avatar-bg-from': meta.bgFrom,
        '--avatar-bg-to': meta.bgTo,
        '--avatar-ring': meta.ringColor,
    } as CSSProperties;

    const classes = [
        'qa-player-avatar',
        `qa-player-avatar--${size}`,
        selected ? 'qa-player-avatar--selected' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <span
            className={classes}
            style={frameStyle}
            data-avatar-id={meta.id}
            role={decorative ? undefined : 'img'}
            aria-label={decorative ? undefined : accessibleLabel}
            aria-hidden={decorative ? true : undefined}
        >
            <PlayerAvatarArt avatarId={meta.id} className="qa-player-avatar-svg" />
        </span>
    );
}
